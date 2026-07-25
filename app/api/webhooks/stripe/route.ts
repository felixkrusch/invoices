import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyStripeSignature } from '@/lib/webhook'
import { enqueueJob } from '@/lib/jobs'
import { getRequestId } from '@/lib/correlation'
import { logger } from '@/lib/logger'

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe webhook is not configured', requestId }, { status: 503 })
  }
  const signature = request.headers.get('stripe-signature')
  const body = await request.text()
  if (!verifyStripeSignature(body, signature, process.env.STRIPE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature', requestId }, { status: 401 })
  }
  try {
    const event = JSON.parse(body)
    if (!event.id || !event.type) return NextResponse.json({ error: 'Invalid event payload', requestId }, { status: 400 })
    const stored = await prisma.webhookEvent.upsert({
      where: { provider_externalId: { provider: 'stripe', externalId: event.id } },
      create: { provider: 'stripe', externalId: event.id, eventType: event.type, payload: event },
      update: {},
    })
    const job = await enqueueJob('WEBHOOK_STRIPE', `webhook:stripe:${event.id}`, { webhookEventId: stored.id })
    return NextResponse.json({ received: true, jobId: job.id, requestId }, { status: 202 })
  } catch (e) {
    logger.error('Stripe webhook error', { error: e instanceof Error ? e.message : String(e) }, request)
    return NextResponse.json({ error: 'Webhook failed', requestId }, { status: 500 })
  }
}

export async function processStripeWebhook(webhookEventId: string) {
  const stored = await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, lastError: null },
  })
  try {
    await handleStripeEvent(stored.payload as Record<string, unknown>)
    await prisma.webhookEvent.update({ where: { id: stored.id }, data: { status: 'SUCCEEDED', processedAt: new Date() } })
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: stored.id },
      data: { status: 'FAILED', lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown error' },
    })
    throw error
  }
}

async function handleStripeEvent(event: Record<string, unknown>) {
  const type = String(event.type || '')
  const data = (event.data as { object?: Record<string, unknown> } | undefined)?.object || {}
  // Mark matching invoice paid when checkout/payment succeeds
  if (type === 'checkout.session.completed' || type === 'invoice.paid' || type === 'payment_intent.succeeded') {
    const invoiceId = (data.metadata as { invoiceId?: string } | undefined)?.invoiceId
      || (typeof data.client_reference_id === 'string' ? data.client_reference_id : null)
    if (invoiceId) {
      await prisma.invoice.updateMany({
        where: { id: invoiceId, status: { not: 'PAID' } },
        data: { status: 'PAID', paidDate: new Date() },
      })
    }
  }
}
