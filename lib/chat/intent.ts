import { z } from 'zod'

export const ActionType = z.enum([
  'CREATE_CONTACT',
  'UPDATE_CONTACT',
  'CREATE_INVOICE_DRAFT',
  'PROPOSE_SEND_INVOICE',
  'EXPLAIN',
])

export type ActionType = z.infer<typeof ActionType>

export const ContactParams = z.object({
  name: z.string().min(1),
  type: z.enum(['CUSTOMER', 'VENDOR']).optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  addressStreet: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  addressZip: z.string().optional(),
  addressCountry: z.string().optional(),
  addressLine2: z.string().optional(),
  taxId: z.string().optional(),
  website: z.string().optional(),
  currency: z.string().optional(),
  notes: z.string().optional(),
})

export const InvoiceDraftParams = z.object({
  contactName: z.string().optional(),
  contactId: z.string().optional(),
  description: z.string(),
  amount: z.number().positive().optional(),
  currency: z.string().optional(),
  lines: z.array(z.object({
    description: z.string(),
    quantity: z.number().positive().optional(),
    unitPrice: z.number(),
    taxRateId: z.string().optional(),
  })).optional(),
})

export const SendInvoiceParams = z.object({
  invoiceId: z.string(),
})

export const IntentSchema = z.object({
  action: ActionType,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
  params: z.union([
    ContactParams,
    InvoiceDraftParams,
    SendInvoiceParams,
    z.record(z.string(), z.any()),
  ]).optional(),
  approved: z.boolean().optional(),
})

export type ChatIntent = z.infer<typeof IntentSchema>

export const SAFE_AUTONOMOUS_ACTIONS: ActionType[] = [
  'CREATE_CONTACT',
  'UPDATE_CONTACT',
  'CREATE_INVOICE_DRAFT',
  'EXPLAIN',
]

export const REQUIRES_EXPLICIT_CONFIRMATION: ActionType[] = [
  'PROPOSE_SEND_INVOICE',
]

export function isSafeAutonomous(action: ActionType): boolean {
  return SAFE_AUTONOMOUS_ACTIONS.includes(action)
}

export function requiresConfirmation(action: ActionType): boolean {
  return REQUIRES_EXPLICIT_CONFIRMATION.includes(action)
}

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.85

export function getSchemaForAction(action: ActionType): z.ZodTypeAny | null {
  switch (action) {
    case 'CREATE_CONTACT':
    case 'UPDATE_CONTACT':
      return ContactParams
    case 'CREATE_INVOICE_DRAFT':
      return InvoiceDraftParams
    case 'PROPOSE_SEND_INVOICE':
      return SendInvoiceParams
    case 'EXPLAIN':
      return z.record(z.string(), z.any())
    default:
      return null
  }
}
