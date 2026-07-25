import { NextRequest, NextResponse } from 'next/server'
import { generateText, tool, stepCountIs, type ModelMessage } from 'ai'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getLlmConfig, createLlmModel } from '@/lib/llm'
import { getCompanyProfile } from '@/lib/companyProfile'
import { ActionType } from '@/lib/chat/intent'
import { validateContactIntent, validateInvoiceDraftIntent } from '@/lib/chat/validation'
import { isSafeAutonomous } from '@/lib/chat/intent'
import { ChatThreadAccessError, loadOrCreateThread, appendToThread, getContextForModel } from '@/lib/chatThreadStore'
import { loadVersionedSkill } from '@/lib/skills'
import { requireUser } from '@/lib/authz'
import { rateLimit } from '@/lib/rate-limit'
import { getRequestId } from '@/lib/correlation'
import { logger } from '@/lib/logger'

type Extracted = { action: ActionType; params?: Record<string, unknown>; confidence?: number; reasoning?: string }

function tryExtractAction(text: string): Extracted | null {
  if (!text) return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) {
    try {
      const obj = JSON.parse(fence[1].trim())
      if (obj && typeof obj.action === 'string') {
        const parsed = ActionType.safeParse(obj.action)
        if (parsed.success) return obj
      }
    } catch { /* ignore */ }
  }
  const jsonish = text.match(/\{[\s\S]*?"action"\s*:\s*"[^"]+"[\s\S]*?\}/)
  if (jsonish) {
    try {
      const obj = JSON.parse(jsonish[0])
      if (obj && typeof obj.action === 'string') {
        const parsed = ActionType.safeParse(obj.action)
        if (parsed.success) return obj
      }
    } catch { /* ignore */ }
  }
  return null
}

function buildSystemPrompt(company: Awaited<ReturnType<typeof getCompanyProfile>>, chatLocked: boolean) {
  return `You are the invoicing assistant for this company.

Company: ${company.name || 'Company'}
Base currency: ${company.baseCurrency}
Default language: ${company.defaultLanguage || 'en'}

You help with contacts and invoices only. You cannot do bookkeeping, journals, bank feeds, or reports.

${chatLocked ? 'CHAT IS LOCKED. Propose actions; do not execute without confirmation.' : 'You may create contacts and invoice drafts when the user clearly asks.'}

When you need structured instructions, call get_skill with one of:
- create-contact
- update-contact
- create-invoice-draft
- core

When acting, end with a single JSON object (optionally in a \`\`\`json fence):
{ "action": "CREATE_CONTACT" | "UPDATE_CONTACT" | "CREATE_INVOICE_DRAFT" | "PROPOSE_SEND_INVOICE" | "EXPLAIN", "confidence": 0-1, "reasoning": "...", "params": { ... } }

For normal conversation, just reply in plain language without JSON.`
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request)
  const session = await requireUser(['ADMIN', 'ACCOUNTANT'])
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Accountant access required', requestId }, { status: 403 })
  }

  const limited = await rateLimit(request, { keyPrefix: `chat:${session.user.id}`, limit: 40 })
  if (limited) {
    limited.headers.set('x-request-id', requestId)
    return limited
  }

  try {
    const contentType = request.headers.get('content-type') || ''
    let message = ''
    let threadId: string | undefined
    let chatLocked = false
    let approved = false
    let approvedAction: Extracted | null = null

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      message = String(form.get('message') || '')
      threadId = form.get('threadId') ? String(form.get('threadId')) : undefined
      chatLocked = form.get('chatLocked') === 'true'
      approved = form.get('approved') === 'true'
      const raw = form.get('approvedAction')
      if (raw && typeof raw === 'string') {
        try { approvedAction = JSON.parse(raw) } catch { /* ignore */ }
      }
    } else {
      const body = await request.json()
      message = String(body.message || body.content || '')
      threadId = body.threadId
      chatLocked = !!body.chatLocked
      approved = !!body.approved
      approvedAction = body.approvedAction || null
    }

    if (!message.trim() && !approvedAction) {
      return NextResponse.json({ error: 'Message required', requestId }, { status: 400 })
    }

    const { thread } = await loadOrCreateThread(session.user.id, threadId)
    if (message.trim()) {
      await appendToThread({
        threadId: thread.id,
        userId: session.user.id,
        role: 'user',
        content: message.trim(),
      })
    }

    const company = await getCompanyProfile()
    const llmConfig = getLlmConfig()
    if (!llmConfig.apiKey && llmConfig.provider !== 'lmstudio') {
      return NextResponse.json({
        response: 'No LLM is configured. An admin can set a provider under Admin → AI.',
        threadId: thread.id,
      })
    }

    // Confirmation path: execute previously proposed action
    if (approved && approvedAction?.action) {
      const result = await executeAction(approvedAction, session.user.id, company)
      await appendToThread({
        threadId: thread.id,
        userId: session.user.id,
        role: 'assistant',
        content: result.response,
        action: approvedAction.action,
        metadata: { executed: true },
      })
      return NextResponse.json({ ...result, threadId: thread.id })
    }

    const history = await getContextForModel(thread.id, session.user.id, 40)
    const modelMessages: ModelMessage[] = history.map(h => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content,
    }))

    const skillVersions = new Map<string, string>()
    const model = createLlmModel(llmConfig)

    const result = await generateText({
      model,
      system: buildSystemPrompt(company, chatLocked),
      messages: modelMessages,
      tools: {
        get_skill: tool({
          description: 'Load instructions for creating contacts or invoice drafts',
          inputSchema: z.object({
            skill: z.enum(['core', 'create-contact', 'update-contact', 'create-invoice-draft']),
          }),
          execute: async ({ skill }) => {
            const loaded = await loadVersionedSkill(skill)
            if (loaded) skillVersions.set(loaded.name, loaded.version)
            return loaded?.content || 'Skill not found'
          },
        }),
      },
      stopWhen: stepCountIs(6),
    })

    const text = result.text || ''
    const extracted = tryExtractAction(text)
    const cleanText = text.replace(/```(?:json)?\s*[\s\S]*?```/gi, '').trim() || text

    if (!extracted) {
      await appendToThread({
        threadId: thread.id,
        userId: session.user.id,
        role: 'assistant',
        content: cleanText || 'OK',
      })
      return NextResponse.json({ response: cleanText || 'OK', threadId: thread.id })
    }

    const action = extracted.action
    const confidence = extracted.confidence ?? 0.8
    const forceProposal = chatLocked || !isSafeAutonomous(action)

    if (forceProposal || action === 'PROPOSE_SEND_INVOICE') {
      const response = cleanText || extracted.reasoning || `Proposed: ${action}`
      await appendToThread({
        threadId: thread.id,
        userId: session.user.id,
        role: 'assistant',
        content: response,
        action,
        metadata: { proposed: true, proposedAction: extracted },
      })
      return NextResponse.json({
        response,
        proposed: true,
        proposedAction: extracted,
        action,
        threadId: thread.id,
      })
    }

    const exec = await executeAction(extracted, session.user.id, company)
    await appendToThread({
      threadId: thread.id,
      userId: session.user.id,
      role: 'assistant',
      content: exec.response,
      action,
      metadata: { executed: true, confidence, skillVersions: Object.fromEntries(skillVersions) },
    })
    return NextResponse.json({ ...exec, threadId: thread.id, action })
  } catch (error) {
    if (error instanceof ChatThreadAccessError) {
      return NextResponse.json({ error: error.message, requestId }, { status: 404 })
    }
    logger.error('chat failed', { error: error instanceof Error ? error.message : String(error), requestId })
    return NextResponse.json({ error: 'Chat failed', requestId }, { status: 500 })
  }
}

async function executeAction(
  extracted: Extracted,
  userId: string,
  company: Awaited<ReturnType<typeof getCompanyProfile>>,
) {
  const action = extracted.action
  const params = extracted.params || {}

  if (action === 'CREATE_CONTACT' || action === 'UPDATE_CONTACT') {
    const v = validateContactIntent(params)
    if (!v.ok || !v.data) return { response: v.error || 'Invalid contact', proposed: false }
    const data = v.data
    if (action === 'UPDATE_CONTACT' && typeof params.id === 'string') {
      const updated = await prisma.contact.update({
        where: { id: params.id },
        data: {
          name: data.name,
          type: data.type || 'CUSTOMER',
          email: data.email,
          phone: data.phone,
          addressStreet: data.addressStreet,
          addressCity: data.addressCity,
          addressState: data.addressState,
          addressZip: data.addressZip,
          addressCountry: data.addressCountry,
          addressLine2: data.addressLine2,
          taxId: data.taxId,
          website: data.website,
          currency: data.currency,
          notes: data.notes,
        },
      })
      return {
        response: `Updated contact ${updated.name}`,
        executed: true,
        entityId: updated.id,
        navigate: { label: 'Open contacts', href: '/app?view=contacts' },
      }
    }
    const created = await prisma.contact.create({
      data: {
        name: data.name,
        type: data.type || 'CUSTOMER',
        email: data.email,
        phone: data.phone,
        addressStreet: data.addressStreet,
        addressCity: data.addressCity,
        addressState: data.addressState,
        addressZip: data.addressZip,
        addressCountry: data.addressCountry,
        addressLine2: data.addressLine2,
        taxId: data.taxId,
        website: data.website,
        currency: data.currency || company.baseCurrency,
        notes: data.notes,
      },
    })
    return {
      response: `Created contact ${created.name}`,
      executed: true,
      entityId: created.id,
      navigate: { label: 'Open contacts', href: '/app?view=contacts' },
    }
  }

  if (action === 'CREATE_INVOICE_DRAFT') {
    const v = validateInvoiceDraftIntent(params)
    if (!v.ok || !v.data) return { response: v.error || 'Invalid invoice draft', proposed: false }
    const d = v.data
    let contactId = d.contactId
    if (!contactId && d.contactName) {
      const existing = await prisma.contact.findFirst({
        where: { name: { equals: d.contactName, mode: 'insensitive' } },
      })
      if (existing) contactId = existing.id
      else {
        const c = await prisma.contact.create({
          data: { name: d.contactName, type: 'CUSTOMER', currency: d.currency || company.baseCurrency },
        })
        contactId = c.id
      }
    }
    if (!contactId) {
      return {
        response: 'I need a contact name or id to draft an invoice.',
        createInvoice: {
          contactName: d.contactName,
          amount: d.amount,
          description: d.description,
          currency: d.currency || company.baseCurrency,
        },
      }
    }
    return {
      response: `Ready to draft an invoice for ${d.contactName || 'contact'}: ${d.description}${d.amount != null ? ` (${d.amount} ${d.currency || company.baseCurrency})` : ''}`,
      createInvoice: {
        contactName: d.contactName,
        amount: d.amount,
        description: d.description,
        currency: d.currency || company.baseCurrency,
      },
      action: 'create_invoice',
      navigate: { label: 'Open invoicing', href: '/app?view=invoicing' },
    }
  }

  if (action === 'EXPLAIN') {
    return { response: extracted.reasoning || 'Done.', executed: true }
  }

  return { response: `Action ${action} is not supported.`, proposed: false }
}
