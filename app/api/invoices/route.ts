import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireUser } from '@/lib/authz'
import { logger } from '@/lib/logger'

const InvoiceLineSchema = z.object({
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxRateId: z.string().optional().nullable(),
})

const InvoiceSchema = z.object({
  contactId: z.string(),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).default('SENT'),
  currency: z.string().length(3).default('EUR'),
  language: z.enum(['en', 'de']).default('en'),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  lines: z.array(InvoiceLineSchema).min(1),
})

async function generateInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_advisory_xact_lock(hashtext(${`invoice-number:${year}`})) IS NULL AS locked`

  const latest = await tx.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  })

  let next = 1
  if (latest?.invoiceNumber) {
    const numPart = latest.invoiceNumber.replace(prefix, '')
    const parsed = parseInt(numPart, 10)
    if (!isNaN(parsed)) next = parsed + 1
  }

  return `${prefix}${String(next).padStart(4, '0')}`
}

export async function GET(request: Request) {
  if (!await requireUser()) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') || ''
    const contactId = url.searchParams.get('contactId') || ''
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(10, parseInt(url.searchParams.get('limit') || '20')))
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (status && ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED'].includes(status)) {
      where.status = status
    }
    if (contactId) {
      where.contactId = contactId
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          contact: true,
          lines: { include: { taxRate: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ])

    return NextResponse.json({
      invoices,
      total,
      page,
      pages: Math.ceil(total / limit),
    })
  } catch (error) {
    logger.error('Error fetching invoices', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await requireUser(['ADMIN', 'ACCOUNTANT'])
  if (!session) return NextResponse.json({ error: 'Accountant access required' }, { status: 403 })
  try {
    const body = await request.json()
    const parsed = InvoiceSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid invoice data', details: parsed.error.format() },
        { status: 400 },
      )
    }

    const { contactId, status, currency: invCurrency, issueDate, dueDate, notes, terms, lines } = parsed.data
    const currency = (invCurrency || 'EUR').toUpperCase()

    const now = new Date()
    const dueDays = 30
    const finalIssueDate = issueDate ? new Date(issueDate) : now
    const finalDueDate = dueDate ? new Date(dueDate) : new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000)

    const taxRateIds = Array.from(new Set(lines.map(l => l.taxRateId).filter((id): id is string => !!id)))
    const taxRates = taxRateIds.length
      ? await prisma.taxRate.findMany({ where: { id: { in: taxRateIds } } })
      : []
    const rateMap = new Map(taxRates.map(r => [r.id, Number(r.rate)]))

    let subtotal = 0
    let taxAmount = 0
    const enrichedLines = lines.map(line => {
      const net = line.quantity * line.unitPrice
      const rate = line.taxRateId ? rateMap.get(line.taxRateId) || 0 : 0
      const tax = net * rate
      subtotal += net
      taxAmount += tax
      return {
        ...line,
        lineTotal: net,
        taxAmount: tax,
      }
    })
    const total = subtotal + taxAmount

    const invoice = await prisma.$transaction(async (tx) => {
      return tx.invoice.create({
        data: {
          invoiceNumber: await generateInvoiceNumber(tx),
          contactId,
          status,
          currency,
          language: parsed.data.language || 'en',
          subtotal,
          taxAmount,
          total,
          issueDate: finalIssueDate,
          dueDate: finalDueDate,
          notes,
          terms,
          lines: {
            create: enrichedLines.map(line => ({
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              taxRateId: line.taxRateId || null,
              lineTotal: line.lineTotal,
              taxAmount: line.taxAmount,
            })),
          },
        },
        include: { contact: true, lines: { include: { taxRate: true } } },
      })
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    logger.error('Error creating invoice', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
}
