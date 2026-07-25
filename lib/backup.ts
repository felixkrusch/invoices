import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { createInterface } from 'readline'
import { prisma } from '@/lib/prisma'
import { encryptionKeyFingerprint } from '@/lib/encryption'

export const BACKUP_VERSION = 1
export const BACKUP_EXTENSION = '.invbackup'
export const BACKUP_CONTENT_TYPE = 'application/gzip'
export const BACKUP_PAGE_SIZE = 1000

type BackupDelegate = {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>
  createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>
  deleteMany(): Promise<{ count: number }>
}

type TableDefinition = {
  file: string
  delegate: string
  orderBy: Record<string, 'asc'> | Array<Record<string, 'asc'>>
  dateFields?: string[]
}

export const BACKUP_TABLES: TableDefinition[] = [
  { file: 'users', delegate: 'user', orderBy: { id: 'asc' }, dateFields: ['createdAt', 'updatedAt', 'emailVerified'] },
  { file: 'totp-recovery-codes', delegate: 'totpRecoveryCode', orderBy: { id: 'asc' }, dateFields: ['createdAt'] },
  { file: 'file-assets', delegate: 'fileAsset', orderBy: { id: 'asc' }, dateFields: ['createdAt'] },
  { file: 'chat-threads', delegate: 'chatThread', orderBy: { id: 'asc' }, dateFields: ['createdAt', 'updatedAt', 'expiresAt', 'archivedAt'] },
  { file: 'chat-messages', delegate: 'chatMessage', orderBy: { id: 'asc' }, dateFields: ['createdAt'] },
  { file: 'chat-message-attachments', delegate: 'chatMessageAttachment', orderBy: [{ messageId: 'asc' }, { fileAssetId: 'asc' }] },
  { file: 'contacts', delegate: 'contact', orderBy: { id: 'asc' }, dateFields: ['vatValidatedAt', 'createdAt', 'updatedAt'] },
  { file: 'tax-rates', delegate: 'taxRate', orderBy: { id: 'asc' }, dateFields: ['effectiveFrom', 'effectiveTo', 'createdAt', 'updatedAt'] },
  { file: 'invoices', delegate: 'invoice', orderBy: { id: 'asc' }, dateFields: ['issueDate', 'dueDate', 'paidDate', 'createdAt', 'updatedAt'] },
  { file: 'invoice-lines', delegate: 'invoiceLine', orderBy: { id: 'asc' } },
  { file: 'recurring-invoices', delegate: 'recurringInvoice', orderBy: { id: 'asc' }, dateFields: ['startDate', 'endDate', 'nextDueDate', 'lastGeneratedAt', 'createdAt', 'updatedAt'] },
  { file: 'templates', delegate: 'template', orderBy: { id: 'asc' }, dateFields: ['createdAt', 'updatedAt'] },
  { file: 'settings', delegate: 'setting', orderBy: { id: 'asc' }, dateFields: ['createdAt', 'updatedAt'] },
]

const DELETE_ORDER = [
  'totpRecoveryCode',
  'chatMessageAttachment', 'chatMessage', 'chatThread',
  'invoiceLine', 'recurringInvoice', 'invoice', 'template', 'setting',
  'fileAsset', 'taxRate', 'contact', 'user',
]

export type BackupManifest = {
  format: 'invoices-portable-backup'
  version: number
  exportedAt: string
  appVersion: string
  encryptionKeyFingerprint: string
  database: { tables: Array<{ name: string; file: string; rows: number; bytes: number; sha256: string }> }
  receipts: Array<{ path: string; bytes: number; mtime: string; sha256: string }>
}

function delegateOf(name: string): BackupDelegate {
  return (prisma as unknown as Record<string, BackupDelegate>)[name]
}

function reviveDates(row: Record<string, unknown>, dateFields: string[] = []) {
  for (const field of dateFields) {
    const v = row[field]
    if (typeof v === 'string') row[field] = new Date(v)
  }
  return row
}

async function writeJsonl(path: string, rows: Record<string, unknown>[]) {
  const body = rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')
  await writeFile(path, body, 'utf8')
  const bytes = Buffer.byteLength(body)
  const sha256 = createHash('sha256').update(body).digest('hex')
  return { bytes, sha256, rows: rows.length }
}

export async function buildBackupDirectory(contentRoot: string): Promise<BackupManifest> {
  await mkdir(join(contentRoot, 'data'), { recursive: true })
  await mkdir(join(contentRoot, 'receipts'), { recursive: true })

  const tables: BackupManifest['database']['tables'] = []
  for (const table of BACKUP_TABLES) {
    const rows = await delegateOf(table.delegate).findMany({ orderBy: table.orderBy })
    const filePath = join(contentRoot, 'data', `${table.file}.jsonl`)
    const meta = await writeJsonl(filePath, rows)
    tables.push({ name: table.delegate, file: `data/${table.file}.jsonl`, ...meta })
  }

  const manifest: BackupManifest = {
    format: 'invoices-portable-backup',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: process.env.npm_package_version || '0.1.0',
    encryptionKeyFingerprint: encryptionKeyFingerprint(),
    database: { tables },
    receipts: [],
  }
  await writeFile(join(contentRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  return manifest
}

export async function restoreBackupDirectory(contentRoot: string) {
  const manifest = JSON.parse(await readFile(join(contentRoot, 'manifest.json'), 'utf8')) as BackupManifest
  if (manifest.format !== 'invoices-portable-backup') throw new Error('Unsupported backup format')

  for (const name of DELETE_ORDER) {
    try { await delegateOf(name).deleteMany() } catch { /* table may not exist yet */ }
  }

  for (const table of BACKUP_TABLES) {
    const def = BACKUP_TABLES.find(t => t.delegate === table.delegate)!
    const filePath = join(contentRoot, 'data', `${def.file}.jsonl`)
    try {
      const text = await readFile(filePath, 'utf8')
      const rows = text.split('\n').filter(Boolean).map(line => reviveDates(JSON.parse(line), def.dateFields))
      if (rows.length) await delegateOf(def.delegate).createMany({ data: rows })
    } catch {
      // missing table file ok
    }
  }
  return manifest
}

export async function sha256File(path: string) {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}
