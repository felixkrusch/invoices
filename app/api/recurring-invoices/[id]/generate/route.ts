import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/authz'
import { logger } from '@/lib/logger'

function advanceDate(date: Date, frequency: string, interval: number): Date {
  const d = new Date(date)
  switch (frequency) {
    case 'WEEKLY': d.setDate(d.getDate() + 7 * interval); break
    case 'MONTHLY': d.setMonth(d.getMonth() + interval); break
    case 'QUARTERLY': d.setMonth(d.getMonth() + 3 * interval); break
    case 'YEARLY': d.setFullYear(d.getFullYear() + interval); break
  }
  return d
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireUser(['ADMIN', 'ACCOUNTANT'])
  if (!session) return NextResponse.json({ error: 'Accountant access required' }, { status: 403 })
  const { id } = await params

  try {
    const rec = await prisma.recurringInvoice.findUnique({ where: { id }, include: { contact: true } })
    if (!rec) return NextResponse.json({ error: 'Recurring not found' }, { status: 404 })
    if (rec.status !== 'ACTIVE') return NextResponse.json({ error: 'Schedule is not active' }, { status: 400 })

    const now = new Date()
    if (rec.endDate && rec.nextDueDate > rec.endDate) {
      await prisma.recurringInvoice.update({ where: { id }, data: { status: 'CANCELLED' } })
      return NextResponse.json({ error: 'Schedule ended' }, { status: 400 })
    }

    type RecurringLine = {
      description?: string
      quantity?: number | string
      unitPrice?: number | string
      taxRateId?: string | null
    }
    const tpl = (rec.templateData as { currency?: string; notes?: string; terms?: string; lines?: RecurringLine[] }) || {}
    const currency = (tpl.currency || 'EUR').toUpperCase()
    const lines = Array.isArray(tpl.lines) ? tpl.lines : []

    if (!lines.length) {
      return NextResponse.json({ error: 'No lines in recurring template' }, { status: 400 })
    }

    const taxRateIds: string[] = Array.from(
      new Set(
        lines
          .map((l) => l.taxRateId)
          .filter((x): x is string => typeof x === 'string' && x.length > 0),
      ),
    )
    const taxRates = taxRateIds.length ? await prisma.taxRate.findMany({ where: { id: { in: taxRateIds } } }) : []
    const rateMap = new Map(taxRates.map(r => [r.id, Number(r.rate)]))

    let subtotal = 0
    let taxAmount = 0
    const enriched = lines.map((l) => {
      const q = Number(l.quantity) || 1
      const p = Number(l.unitPrice) || 0
      const net = q * p
      const rate = l.taxRateId ? rateMap.get(l.taxRateId) || 0 : 0
      const tax = net * rate
      subtotal += net
      taxAmount += tax
      return {
        description: l.description ?? '',
        quantity: q,
        unitPrice: p,
        taxRateId: l.taxRateId || null,
        lineTotal: net,
        taxAmount: tax,
      }
    })
    const total = subtotal + taxAmount

    const invoice = await prisma.$transaction(async (tx) => {
      const year = now.getFullYear()
      const prefix = `INV-${year}-`
      await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_advisory_xact_lock(hashtext(${`invoice-number:${year}`})) IS NULL AS locked`
      const latest = await tx.invoice.findFirst({
        where: { invoiceNumber: { startsWith: prefix } },
        orderBy: { invoiceNumber: 'desc' },
        select: { invoiceNumber: true },
      })
      let next = 1
      if (latest?.invoiceNumber) {
        const n = parseInt(latest.invoiceNumber.replace(prefix, ''), 10)
        if (!isNaN(n)) next = n + 1
      }
      const invNum = `${prefix}${String(next).padStart(4, '0')}`

      return tx.invoice.create({
        data: {
          invoiceNumber: invNum,
          contactId: rec.contactId,
          status: 'DRAFT',
          currency,
          subtotal,
          taxAmount,
          total,
          issueDate: rec.nextDueDate,
          dueDate: new Date(rec.nextDueDate.getTime() + 30 * 86400000),
          notes: tpl.notes || rec.notes || null,
          terms: tpl.terms || null,
          lines: {
            create: enriched.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxRateId: l.taxRateId,
              lineTotal: l.lineTotal,
              taxAmount: l.taxAmount,
            })),
          },
        },
        include: { contact: true, lines: { include: { taxRate: true } } },
      })
    })

    const nextDue = advanceDate(rec.nextDueDate, rec.frequency, rec.interval)
    await prisma.recurringInvoice.update({
      where: { id: rec.id },
      data: {
        lastGeneratedAt: now,
        nextDueDate: nextDue,
        status: rec.endDate && nextDue > rec.endDate ? 'CANCELLED' : rec.status,
      },
    })

    return NextResponse.json({ invoice, nextDueDate: nextDue })
  } catch (error) {
    logger.error('Error generating recurring invoice', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 })
  }
}
