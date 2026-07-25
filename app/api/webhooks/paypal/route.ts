import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { enqueueJob } from '@/lib/jobs'
import { getRequestId } from '@/lib/correlation'
import { logger } from '@/lib/logger'

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    return NextResponse.json({ error: 'PayPal webhook is not configured', requestId }, { status: 503 })
  }
  try {
    const event = await request.json()
    const externalId = String(event.id || event.event_id || '')
    if (!externalId) return NextResponse.json({ error: 'Invalid payload', requestId }, { status: 400 })
    const stored = await prisma.webhookEvent.upsert({
      where: { provider_externalId: { provider: 'paypal', externalId } },
      create: { provider: 'paypal', externalId, eventType: String(event.event_type || 'unknown'), payload: event },
      update: {},
    })
    const job = await enqueueJob('WEBHOOK_PAYPAL', `webhook:paypal:${externalId}`, { webhookEventId: stored.id })
    return NextResponse.json({ received: true, jobId: job.id, requestId }, { status: 202 })
  } catch (e) {
    logger.error('PayPal webhook error', { error: e instanceof Error ? e.message : String(e) }, request)
    return NextResponse.json({ error: 'Webhook failed', requestId }, { status: 500 })
  }
}

export async function processPayPalWebhook(webhookEventId: string) {
  const stored = await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, lastError: null },
  })
  try {
    const payload = stored.payload as Record<string, unknown>
    const resource = (payload.resource as Record<string, unknown> | undefined) || {}
    const custom = resource.custom_id || resource.invoice_id
    if (typeof custom === 'string') {
      await prisma.invoice.updateMany({
        where: { id: custom, status: { not: 'PAID' } },
        data: { status: 'PAID', paidDate: new Date() },
      })
    }
    await prisma.webhookEvent.update({ where: { id: stored.id }, data: { status: 'SUCCEEDED', processedAt: new Date() } })
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: stored.id },
      data: { status: 'FAILED', lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown error' },
    })
    throw error
  }
}
