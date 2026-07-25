import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireUser } from '@/lib/authz'
import { logger } from '@/lib/logger'

const InvoiceLineSchema = z.object({
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxRateId: z.string().optional().nullable(),
})

const InvoiceUpdateSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  paidDate: z.string().datetime().optional().nullable(),
  contactId: z.string().optional(),
  currency: z.string().length(3).optional(),
  language: z.enum(['en', 'de']).optional(),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  lines: z.array(InvoiceLineSchema).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireUser()) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { id } = await params
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        contact: true,
        lines: { include: { taxRate: true } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return NextResponse.json(invoice)
  } catch (error) {
    logger.error('Error fetching invoice', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireUser(['ADMIN', 'ACCOUNTANT'])
  if (!session) return NextResponse.json({ error: 'Accountant access required' }, { status: 403 })
  const { id } = await params
  const body = await request.json()
  const parsed = InvoiceUpdateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid invoice data', details: parsed.error.format() },
      { status: 400 },
    )
  }

  try {
    const data = parsed.data

    if (!data.lines) {
      const updateData: Record<string, unknown> = {}
      if (data.status) updateData.status = data.status
      if (data.paidDate !== undefined) updateData.paidDate = data.paidDate ? new Date(data.paidDate) : null

      const invoice = await prisma.invoice.update({
        where: { id },
        data: updateData,
        include: { contact: true, lines: { include: { taxRate: true } } },
      })
      return NextResponse.json(invoice)
    }

    const existing = await prisma.invoice.findUnique({ where: { id }, include: { lines: true } })
    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    if (existing.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Only DRAFT invoices can be edited. Cancel and create a new one for changes.' }, { status: 400 })
    }

    const taxRateIds = Array.from(new Set(data.lines.map(l => l.taxRateId).filter((x): x is string => !!x)))
    const taxRates = taxRateIds.length ? await prisma.taxRate.findMany({ where: { id: { in: taxRateIds } } }) : []
    const rateMap = new Map(taxRates.map(r => [r.id, Number(r.rate)]))

    let subtotal = 0
    let taxAmount = 0
    const enriched = data.lines.map(l => {
      const net = l.quantity * l.unitPrice
      const rate = l.taxRateId ? rateMap.get(l.taxRateId) || 0 : 0
      const tax = net * rate
      subtotal += net
      taxAmount += tax
      return { ...l, lineTotal: net, taxAmount: tax }
    })
    const total = subtotal + taxAmount

    const updated = await prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } })

      return tx.invoice.update({
        where: { id },
        data: {
          contactId: data.contactId || existing.contactId,
          currency: data.currency || existing.currency,
          language: data.language || existing.language || 'en',
          issueDate: data.issueDate ? new Date(data.issueDate) : existing.issueDate,
          dueDate: data.dueDate ? new Date(data.dueDate) : existing.dueDate,
          notes: data.notes !== undefined ? data.notes : existing.notes,
          terms: data.terms !== undefined ? data.terms : existing.terms,
          subtotal,
          taxAmount,
          total,
          status: data.status || existing.status,
          paidDate: data.paidDate !== undefined ? (data.paidDate ? new Date(data.paidDate) : null) : existing.paidDate,
          lines: {
            create: enriched.map(l => ({
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxRateId: l.taxRateId || null,
              lineTotal: l.lineTotal,
              taxAmount: l.taxAmount,
            })),
          },
        },
        include: { contact: true, lines: { include: { taxRate: true } } },
      })
    })

    return NextResponse.json(updated)
  } catch (error) {
    logger.error('Error updating invoice', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireUser(['ADMIN', 'ACCOUNTANT'])) return NextResponse.json({ error: 'Accountant access required' }, { status: 403 })
  const { id } = await params
  try {
    const inv = await prisma.invoice.findUnique({ where: { id } })
    if (!inv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (inv.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Only DRAFT invoices can be permanently deleted. Use Cancel for others.' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } })
      await tx.invoice.delete({ where: { id } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Error deleting invoice', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
  }
}
