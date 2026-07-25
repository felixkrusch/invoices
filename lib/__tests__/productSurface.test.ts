import { describe, expect, it } from 'vitest'
import { getApiAccessPolicy, isRoleAllowed } from '@/lib/apiAccessPolicy'
import { ActionType, isSafeAutonomous } from '@/lib/chat/intent'
import { BACKUP_EXTENSION, BACKUP_FORMAT, BACKUP_TABLES } from '@/lib/backup'
import { MASTER_LICENSE_KEY, TRIAL_DAYS, isWithinTrial, verifyLicenseKey } from '@/lib/license'

describe('product surface', () => {
  it('uses entrytwo-style trial constants', () => {
    expect(TRIAL_DAYS).toBe(30)
    expect(MASTER_LICENSE_KEY.length).toBeGreaterThan(10)
    expect(isWithinTrial(null)).toBe(true)
  })

  it('accepts master license key', async () => {
    expect(await verifyLicenseKey(MASTER_LICENSE_KEY)).toBe(true)
    expect(await verifyLicenseKey('not-a-real-key')).toBe(false)
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
