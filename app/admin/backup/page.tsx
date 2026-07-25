'use client'

import { useRef, useState } from 'react'
import { Archive, CheckCircle2, Database, HardDriveDownload, ShieldAlert, Upload } from 'lucide-react'

type ImportResult = {
  ok: boolean
  version: number
  exportedAt: string
  imported: Record<string, number>
}

export default function BackupPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [importing, setImporting] = useState(false)
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string; details?: string[] } | null>(null)

  const handleExport = () => {
    setStatus(null)
    window.location.assign('/api/backup/export')
  }

  const handleImport = async () => {
    if (!selectedFile || !confirmed || importing) return
    setImporting(true)
    setStatus(null)
    try {
      const response = await fetch('/api/backup/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/gzip',
          'X-Invoices-Confirm-Replace': 'replace-all-data',
        },
        body: selectedFile,
      })
      const result = await response.json() as ImportResult & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Restore failed')

      const details = Object.entries(result.imported || {})
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `${count.toLocaleString()} ${name}`)
      setStatus({
        kind: 'success',
        message: `Backup from ${new Date(result.exportedAt).toLocaleString()} restored successfully.`,
        details,
      })
      setSelectedFile(null)
      setConfirmed(false)
      if (fileRef.current) fileRef.current.value = ''
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Restore failed' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-emerald-400">
          <Archive className="h-4 w-4" />
          Disaster recovery
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Backup & restore</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Export a portable archive of users, contacts, invoices, tax rates, settings, chat history, and uploaded files.
          Restore replaces all application data on this installation.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 font-medium text-zinc-100">
                <HardDriveDownload className="h-4 w-4 text-emerald-400" />
                Export archive
              </h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Downloads a compressed .invbackup file. Keep it offline with your ENCRYPTION_KEY if you store secrets.
              </p>
            </div>
            <span className="rounded border border-emerald-900 bg-emerald-950/50 px-2 py-1 font-mono text-[10px] text-emerald-400">.invbackup</span>
          </div>

          <div className="my-6 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <Database className="mb-2 h-4 w-4 text-sky-400" />
            <div className="text-xs text-zinc-400">Contacts, invoices, tax rates, users, settings, files, chat</div>
          </div>

          <button
            type="button"
            onClick={handleExport}
            className="mt-auto rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Download backup
          </button>
        </section>

        <section className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="flex items-center gap-2 font-medium text-zinc-100">
            <Upload className="h-4 w-4 text-amber-400" />
            Restore archive
          </h2>
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            This permanently replaces all data on this server. Export a current backup first.
          </p>

          <div className="mt-4 rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-xs text-amber-200/90 flex gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Use the same ENCRYPTION_KEY that created the backup.
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".invbackup,application/gzip"
            className="mt-4 block w-full text-xs text-zinc-400"
            onChange={e => {
              setSelectedFile(e.target.files?.[0] || null)
              setConfirmed(false)
              setStatus(null)
            }}
          />

          <label className="mt-4 flex items-start gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            I understand this will replace all invoices, contacts, users, and settings on this installation.
          </label>

          <button
            type="button"
            disabled={!selectedFile || !confirmed || importing}
            onClick={() => void handleImport()}
            className="mt-auto rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-950/70 disabled:opacity-40"
          >
            {importing ? 'Restoring…' : 'Restore backup'}
          </button>
        </section>
      </div>

      {status && (
        <div className={`mt-6 rounded-lg border p-4 text-sm ${
          status.kind === 'success'
            ? 'border-emerald-900 bg-emerald-950/30 text-emerald-200'
            : 'border-red-900 bg-red-950/30 text-red-200'
        }`}>
          <div className="flex items-center gap-2 font-medium">
            {status.kind === 'success' && <CheckCircle2 className="h-4 w-4" />}
            {status.message}
          </div>
          {status.details?.length ? (
            <ul className="mt-2 list-disc pl-5 text-xs opacity-90">
              {status.details.map(d => <li key={d}>{d}</li>)}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  )
}
