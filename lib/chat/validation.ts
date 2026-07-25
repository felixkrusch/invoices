import { z } from 'zod'
import { ContactParams, InvoiceDraftParams } from './intent'

export type JournalLineInput = {
  accountCode?: string
  debit?: number
  credit?: number
  description?: string
  taxRateId?: string | null
  currency?: string
}

export function validateContactIntent(params: unknown) {
  const parsed = ContactParams.safeParse(params)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.message, data: null }
  }
  return { ok: true as const, error: null, data: parsed.data }
}

export function validateInvoiceDraftIntent(params: unknown) {
  const parsed = InvoiceDraftParams.safeParse(params)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.message, data: null }
  }
  return { ok: true as const, error: null, data: parsed.data }
}

export function validateJournalIntent(_params: unknown) {
  return { ok: false as const, error: 'Journal entries are not supported in this app', data: null }
}

export function validateRestoreTarget(_params: unknown) {
  return { ok: false as const, error: 'Restore is not supported in this app', data: null }
}
