'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Lock, Paperclip, Send, Unlock, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import AmberTerminalThinking from './AmberTerminalThinking'

interface Message {
  role: 'user' | 'assistant'
  content: string
  action?: string
  createInvoice?: {
    contactName?: string
    amount?: number
    description?: string
    currency?: string
  }
  navigate?: { label: string; href: string }
  proposedAction?: { action?: string; params?: Record<string, unknown>; confidence?: number; reasoning?: string }
}

type LlmStatus = {
  connected: boolean
  hasKey: boolean
  provider?: string
  model?: string
  lastChecked?: number
}

export default function ChatPage() {
  const router = useRouter()
  const t = useTranslations('app.chat')
  const tToasts = useTranslations('app.toasts')

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: t('welcome') || 'Ask me to draft an invoice or add a contact.' },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chatLocked, setChatLocked] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('chatThreadId') || null
    return null
  })
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastStatusCheckRef = useRef(0)
  const STATUS_STALE_MS = 60_000

  const refreshLlmStatus = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastStatusCheckRef.current < STATUS_STALE_MS) return
    lastStatusCheckRef.current = now
    try {
      const r = await fetch('/api/llm/status')
      const d = await r.json()
      if (!r.ok) {
        setLlmStatus({ connected: false, hasKey: false })
        return
      }
      setLlmStatus(d)
    } catch {
      setLlmStatus({ connected: false, hasKey: false })
    }
  }, [])

  useEffect(() => {
    void refreshLlmStatus(true)
  }, [refreshLlmStatus])

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) void refreshLlmStatus()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refreshLlmStatus])

  useEffect(() => {
    if (!threadId) return
    let cancelled = false
    fetch(`/api/chat/threads/${encodeURIComponent(threadId)}`)
      .then(async response => {
        if (response.status === 404) {
          localStorage.removeItem('chatThreadId')
          if (!cancelled) setThreadId(null)
          return null
        }
        if (!response.ok) throw new Error('Could not restore chat history')
        return response.json()
      })
      .then(data => {
        if (cancelled || !data?.messages?.length) return
        setMessages(data.messages.map((m: { role: 'user' | 'assistant'; content: string }) => ({
          role: m.role,
          content: m.content,
        })))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [threadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const send = async (override?: string, approvedAction?: Message['proposedAction']) => {
    const text = (override ?? input).trim()
    if ((!text && !approvedAction) || isLoading) return

    if (text) {
      setMessages(prev => [...prev, { role: 'user', content: text }])
      setInput('')
    }
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          threadId,
          chatLocked,
          approved: !!approvedAction,
          approvedAction,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Chat failed')

      if (data.threadId) {
        setThreadId(data.threadId)
        localStorage.setItem('chatThreadId', data.threadId)
      }

      const assistant: Message = {
        role: 'assistant',
        content: data.response || 'OK',
        action: data.action,
        createInvoice: data.createInvoice,
        navigate: data.navigate,
        proposedAction: data.proposed ? data.proposedAction : undefined,
      }
      setMessages(prev => [...prev, assistant])

      setLlmStatus(prev => ({
        connected: true,
        hasKey: true,
        provider: prev?.provider,
        model: prev?.model,
        lastChecked: Date.now(),
      }))

      // Match entrytwo: after contact create/update, switch right panel and open details
      const act = String(data.action || '').toUpperCase()
      if ((act === 'CREATE_CONTACT' || act === 'UPDATE_CONTACT') && data.entityId) {
        const pending = {
          id: String(data.entityId),
          prefill: {
            name: String(data.response || '').replace(/^(Created|Updated) contact\s*/i, '').trim(),
          },
        }
        ;(window as unknown as { __pendingContactForm?: typeof pending }).__pendingContactForm = pending
        window.dispatchEvent(new CustomEvent('contacts-updated'))
        setTimeout(() => {
          router.push('/app?view=contacts')
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('open-contact-form', { detail: pending }))
          }, 140)
        }, 40)
      }

      // Same process as entrytwo: after invoice draft create, open invoicing + details
      const isInvoiceCreate =
        act === 'CREATE_INVOICE_DRAFT'
        || act === 'CREATE_INVOICE'
        || !!data.createInvoice
        || /created invoice draft/i.test(String(data.response || ''))

      if (isInvoiceCreate) {
        const invoiceId = typeof data.entityId === 'string' ? data.entityId : undefined
        ;(window as unknown as { __pendingInvoiceId?: string }).__pendingInvoiceId = invoiceId
        window.dispatchEvent(new CustomEvent('invoices-updated'))
        toast.success(invoiceId ? 'Invoice draft created' : 'Invoice draft ready')
        setTimeout(() => {
          router.push('/app?view=invoicing')
          setTimeout(() => {
            if (invoiceId) {
              window.dispatchEvent(new CustomEvent('open-invoice-details', { detail: { id: invoiceId } }))
            } else if (data.createInvoice) {
              window.dispatchEvent(new CustomEvent('prefill-invoice', { detail: data.createInvoice }))
            }
          }, 180)
        }, 40)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chat failed')
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.' }])
      setLlmStatus(prev => ({
        connected: false,
        hasKey: prev?.hasKey ?? true,
        provider: prev?.provider,
        model: prev?.model,
        lastChecked: Date.now(),
      }))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              m.role === 'user' ? 'bg-emerald-900/40 text-emerald-50' : 'border border-zinc-800 bg-zinc-900 text-zinc-200'
            }`}>
              {m.content}
              {m.createInvoice && (
                <button
                  type="button"
                  className="mt-2 block text-xs text-emerald-400 hover:underline"
                  onClick={() => router.push('/app?view=invoicing')}
                >
                  Open invoicing
                </button>
              )}
              {m.navigate && (
                <button
                  type="button"
                  className="mt-2 block text-xs text-emerald-400 hover:underline"
                  onClick={() => router.push(m.navigate!.href)}
                >
                  {m.navigate.label}
                </button>
              )}
              {m.proposedAction && (
                <button
                  type="button"
                  className="mt-2 block rounded bg-emerald-800/50 px-2 py-1 text-xs hover:bg-emerald-800"
                  onClick={() => void send('Yes, do it', m.proposedAction)}
                >
                  Confirm
                </button>
              )}
            </div>
          </div>
        ))}
        {isLoading && <AmberTerminalThinking />}
        <div ref={bottomRef} />
      </div>

      <div className="space-y-2 border-t border-zinc-800 p-3">
        <div className="text-[10px]">
          {llmStatus ? (
            <span className={`inline-flex items-center gap-1.5 ${llmStatus.connected ? 'text-emerald-400' : 'text-rose-400'}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${llmStatus.connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {llmStatus.connected ? 'connected' : (llmStatus.hasKey ? 'unreachable' : 'not configured')}
              {llmStatus.model ? ` • ${llmStatus.model}` : ''}
              {llmStatus.provider ? ` (${llmStatus.provider})` : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-zinc-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500" />
              Checking LLM…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title={chatLocked ? 'Unlock chat' : 'Lock chat (propose only)'}
            onClick={() => setChatLocked(v => !v)}
            className="rounded border border-zinc-800 p-2 text-zinc-400 hover:text-zinc-200"
          >
            {chatLocked ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
          <input ref={fileInputRef} type="file" className="hidden" />
          <button
            type="button"
            className="cursor-not-allowed rounded border border-zinc-800 p-2 text-zinc-600"
            title="Attachments coming later"
            disabled
          >
            <Paperclip size={16} />
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onFocus={() => void refreshLlmStatus()}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            placeholder={t('placeholder') || 'Draft an invoice for…'}
            className="flex-1 rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={isLoading || !input.trim()}
            className="rounded bg-emerald-800 p-2 hover:bg-emerald-700 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
          {threadId && (
            <button
              type="button"
              title="New chat"
              className="rounded border border-zinc-800 p-2 text-zinc-400"
              onClick={() => {
                localStorage.removeItem('chatThreadId')
                setThreadId(null)
                setMessages([{ role: 'assistant', content: t('welcome') || 'New conversation.' }])
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
