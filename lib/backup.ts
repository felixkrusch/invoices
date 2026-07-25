import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { appendFile, copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { createInterface } from 'readline'
import { prisma } from '@/lib/prisma'
import { encryptionKeyFingerprint } from '@/lib/encryption'

export const BACKUP_VERSION = 1
export const BACKUP_EXTENSION = '.invbackup'
export const BACKUP_CONTENT_TYPE = 'application/gzip'
export const BACKUP_PAGE_SIZE = 1000
export const BACKUP_FORMAT = 'invoices-portable-backup'

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
  { file: 'oauth-accounts', delegate: 'oAuthAccount', orderBy: { id: 'asc' } },
  { file: 'verification-tokens', delegate: 'verificationToken', orderBy: [{ identifier: 'asc' }, { token: 'asc' }] },
  { file: 'totp-recovery-codes', delegate: 'totpRecoveryCode', orderBy: { id: 'asc' }, dateFields: ['createdAt'] },
  { file: 'user-invitations', delegate: 'userInvitation', orderBy: { id: 'asc' }, dateFields: ['expiresAt', 'acceptedAt', 'createdAt'] },
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
  'userInvitation', 'oAuthAccount', 'verificationToken',
  'invoiceLine', 'recurringInvoice', 'invoice', 'template', 'setting',
  'fileAsset', 'taxRate', 'contact', 'user',
]

export type BackupManifest = {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  appVersion: string
  encryptionKeyFingerprint: string
  database: { tables: Array<{ name: string; file: string; rows: number; bytes: number; sha256: string }> }
  receipts: Array<{ path: string; bytes: number; mtime: string; sha256: string }>
}

function delegate(client: unknown, name: string): BackupDelegate {
  return (client as Record<string, BackupDelegate>)[name]
}

export async function sha256File(path: string) {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

export async function buildBackupDirectory(root: string, client: unknown = prisma): Promise<BackupManifest> {
  const dataDir = join(root, 'data')
  const filesOut = join(root, 'files')
  await mkdir(dataDir, { recursive: true })
  await mkdir(filesOut, { recursive: true })

  const tables: BackupManifest['database']['tables'] = []
  for (const table of BACKUP_TABLES) {
    const output = join(dataDir, `${table.file}.ndjson`)
    await writeFile(output, '')
    let rows = 0
    while (true) {
      const page = await delegate(client, table.delegate).findMany({
        orderBy: table.orderBy,
        take: BACKUP_PAGE_SIZE,
        skip: rows,
      })
      if (page.length === 0) break
      await appendFile(output, page.map(record => JSON.stringify(record)).join('\n') + '\n')
      rows += page.length
      if (page.length < BACKUP_PAGE_SIZE) break
    }
    const info = await stat(output)
    tables.push({
      name: table.delegate,
      file: `data/${table.file}.ndjson`,
      rows,
      bytes: info.size,
      sha256: await sha256File(output),
    })
  }

  const receipts: BackupManifest['receipts'] = []
  const fileSource = join(process.cwd(), '.data', 'files')
  const names = await readdir(fileSource).catch(() => [] as string[])
  for (const name of names.sort()) {
    if (name.startsWith('.') || basename(name) !== name) continue
    const source = join(fileSource, name)
    const info = await stat(source).catch(() => null)
    if (!info?.isFile()) continue
    const target = join(filesOut, name)
    await copyFile(source, target)
    receipts.push({
      path: `files/${name}`,
      bytes: info.size,
      mtime: info.mtime.toISOString(),
      sha256: await sha256File(target),
    })
  }

  const copied = new Set(receipts.map(r => basename(r.path)))
  const fileAssets = await delegate(client, 'fileAsset').findMany({ orderBy: { id: 'asc' } })
  const missing = fileAssets.map(a => String(a.storageKey)).filter(n => !copied.has(n))
  if (missing.length) {
    throw new Error(`Cannot create backup: ${missing.length} file(s) missing (${missing.slice(0, 5).join(', ')})`)
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: process.env.APP_VERSION || process.env.npm_package_version || '0.1.0',
    encryptionKeyFingerprint: encryptionKeyFingerprint(),
    database: { tables },
    receipts,
  }
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

export async function validateBackupDirectory(root: string): Promise<BackupManifest> {
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) as BackupManifest
  if (manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup format or version (expected ${BACKUP_VERSION})`)
  }
  if (manifest.encryptionKeyFingerprint !== encryptionKeyFingerprint()) {
    throw new Error('Backup was created with a different ENCRYPTION_KEY. Restore the original key first.')
  }
  if (!Array.isArray(manifest.database?.tables) || !Array.isArray(manifest.receipts)) {
    throw new Error('Backup manifest is incomplete')
  }

  const expected = new Set(BACKUP_TABLES.map(t => t.delegate))
  for (const table of manifest.database.tables) {
    if (!expected.delete(table.name)) throw new Error(`Unexpected backup table: ${table.name}`)
    const path = join(root, table.file)
    const info = await stat(path)
    if (!info.isFile() || info.size !== table.bytes || (await sha256File(path)) !== table.sha256) {
      throw new Error(`Integrity check failed for ${table.file}`)
    }
  }
  if (expected.size) throw new Error(`Backup missing tables: ${Array.from(expected).join(', ')}`)

  for (const receipt of manifest.receipts) {
    if (!/^files\/[a-zA-Z0-9_.-]+$/.test(receipt.path) || receipt.path.includes('..')) {
      throw new Error(`Unsafe file path: ${receipt.path}`)
    }
    const path = join(root, receipt.path)
    const info = await stat(path)
    if (!info.isFile() || info.size !== receipt.bytes || (await sha256File(path)) !== receipt.sha256) {
      throw new Error(`Integrity check failed for ${receipt.path}`)
    }
  }
  return manifest
}

async function* readNdjsonChunks(path: string, chunkSize = BACKUP_PAGE_SIZE): AsyncGenerator<Record<string, unknown>[]> {
  let records: Record<string, unknown>[] = []
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    records.push(JSON.parse(line) as Record<string, unknown>)
    if (records.length >= chunkSize) {
      yield records
      records = []
    }
  }
  if (records.length) yield records
}

function restoreTypes(record: Record<string, unknown>, dateFields: string[] = []): Record<string, unknown> {
  const restored = { ...record }
  for (const field of dateFields) {
    if (typeof restored[field] === 'string') restored[field] = new Date(restored[field] as string)
  }
  return restored
}

export async function restoreBackupDirectory(root: string, manifest: BackupManifest): Promise<Record<string, number>> {
  const filesRoot = join(process.cwd(), '.data')
  const filesTarget = join(filesRoot, 'files')
  const staged = join(filesRoot, `.files-restore-${Date.now()}`)
  await mkdir(staged, { recursive: true })
  for (const receipt of manifest.receipts) {
    await copyFile(join(root, receipt.path), join(staged, basename(receipt.path)))
  }

  const counts: Record<string, number> = {}
  await mkdir(filesRoot, { recursive: true })
  const previous = join(filesRoot, `.files-previous-${Date.now()}`)
  const hadExisting = await stat(filesTarget).then(() => true).catch(() => false)
  let swapped = false

  try {
    await prisma.$transaction(async tx => {
      for (const name of DELETE_ORDER) await delegate(tx, name).deleteMany()

      for (const table of BACKUP_TABLES) {
        let restoredRows = 0
        for await (const records of readNdjsonChunks(join(root, 'data', `${table.file}.ndjson`))) {
          const chunk = records.map(r => restoreTypes(r, table.dateFields))
          if (chunk.length) await delegate(tx, table.delegate).createMany({ data: chunk })
          restoredRows += chunk.length
        }
        const expected = manifest.database.tables.find(t => t.name === table.delegate)?.rows
        if (expected !== restoredRows) {
          throw new Error(`Row count mismatch for ${table.delegate}: expected ${expected}, restored ${restoredRows}`)
        }
        counts[table.delegate] = restoredRows
      }

      if (hadExisting) await rename(filesTarget, previous)
      await rename(staged, filesTarget)
      swapped = true
    }, { maxWait: 60_000, timeout: Number(process.env.BACKUP_TRANSACTION_TIMEOUT_MS || 30 * 60_000) })

    if (hadExisting) await rm(previous, { recursive: true, force: true })
  } catch (error) {
    await rm(staged, { recursive: true, force: true }).catch(() => {})
    if (swapped) await rm(filesTarget, { recursive: true, force: true }).catch(() => {})
    if (hadExisting && swapped) await rename(previous, filesTarget).catch(() => {})
    throw error
  }

  counts.files = manifest.receipts.length
  return counts
}
