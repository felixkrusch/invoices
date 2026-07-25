import { describe, expect, it } from 'vitest'
import { getApiAccessPolicy, isRoleAllowed } from '@/lib/apiAccessPolicy'
import { ActionType, isSafeAutonomous } from '@/lib/chat/intent'
import { BACKUP_EXTENSION, BACKUP_FORMAT, BACKUP_TABLES } from '@/lib/backup'
import { licenseMode } from '@/lib/license'

describe('product surface', () => {
  it('defaults license mode to open', () => {
    delete process.env.LICENSE_MODE
    expect(licenseMode()).toBe('open')
  })

  it('gates backup and chat correctly', () => {
    expect(getApiAccessPolicy('/api/backup/export', 'GET').access).toBe('admin')
    expect(getApiAccessPolicy('/api/chat', 'POST').access).toBe('accountant')
    expect(isRoleAllowed('accountant', 'VIEWER')).toBe(false)
    expect(isRoleAllowed('accountant', 'ACCOUNTANT')).toBe(true)
  })

  it('chat actions are invoice-only', () => {
    const actions = ActionType.options
    expect(actions).toContain('CREATE_INVOICE_DRAFT')
    expect(actions).toContain('CREATE_CONTACT')
    expect(actions).not.toContain('CREATE_JOURNAL')
    expect(isSafeAutonomous('CREATE_CONTACT')).toBe(true)
  })

  it('backup format is invoices-specific', () => {
    expect(BACKUP_EXTENSION).toBe('.invbackup')
    expect(BACKUP_FORMAT).toBe('invoices-portable-backup')
    expect(BACKUP_TABLES.some(t => t.delegate === 'invoice')).toBe(true)
    expect(BACKUP_TABLES.some(t => t.delegate === 'journalEntry')).toBe(false)
  })
})
