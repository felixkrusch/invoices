'use client'

import { ReactNode, Suspense, useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import toast from 'react-hot-toast'
import TopBar from './TopBar'
import InvoicingPanel from './InvoicingPanel'
import LicenseGate from './LicenseGate'
import LicenseModal from './LicenseModal'
import { ErrorBoundary } from '../components/ErrorBoundary'

function ContactsEmbed() {
  const [ContactsPage, setContactsPage] = useState<React.ComponentType | null>(null)
  useEffect(() => {
    import('@/app/contacts/page').then(m => setContactsPage(() => m.default)).catch(() => undefined)
  }, [])
  if (!ContactsPage) return <div className="p-6 text-sm text-zinc-500">Loading contacts…</div>
  return <ContactsPage />
}

function AppContent({ children }: { children: ReactNode }) {
  const t = useTranslations('app.toasts')
  const tShell = useTranslations('app.shell')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [licenseStatus, setLicenseStatus] = useState<any>(null)
  const [licenseLoading, setLicenseLoading] = useState(true)
  const [showLicenseModal, setShowLicenseModal] = useState(false)
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null)

  useEffect(() => {
    if (pathname === '/contacts') router.replace('/app?view=contacts')
    else if (pathname === '/invoicing') router.replace('/app?view=invoicing')
    else if (pathname === '/reports') router.replace('/app?view=invoicing')
  }, [pathname, router])

  const rawView = searchParams?.get('view')
  const view = (rawView as 'dashboard' | 'contacts' | 'invoicing') || 'invoicing'

  useEffect(() => {
    if (rawView && !['dashboard', 'contacts', 'invoicing'].includes(rawView)) {
      router.replace('/app?view=invoicing')
    }
  }, [rawView, router])

  useEffect(() => {
    fetch('/api/bootstrap/status')
      .then(r => r.json())
      .then(d => setNeedsBootstrap(!!d.needsBootstrap))
      .catch(() => setNeedsBootstrap(false))
  }, [])

  const loadLicense = useCallback(async () => {
    setLicenseLoading(true)
    try {
      const res = await fetch('/api/license/status')
      if (res.ok) setLicenseStatus(await res.json())
      else setLicenseStatus(null)
    } catch {
      setLicenseStatus(null)
    } finally {
      setLicenseLoading(false)
    }
  }, [])

  useEffect(() => { void loadLicense() }, [loadLicense])

  const handleLicenseActivated = () => {
    void loadLicense()
    setShowLicenseModal(false)
    window.dispatchEvent(new CustomEvent('license-updated'))
    toast.success(t('licenseActivated') || 'License activated')
  }

  const isLicensed = !!licenseStatus?.isLicensed
  const inTrial = !!licenseStatus?.inTrial
  const showPaywall = !licenseLoading && !isLicensed && !inTrial

  if (showPaywall) {
    return <LicenseGate onActivated={handleLicenseActivated} />
  }

  if (needsBootstrap === null) {
    return <div className="h-screen bg-zinc-950" />
  }

  const setView = (v: string) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('view', v)
    router.push(`/app?${params.toString()}`)
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-200">
      <Suspense fallback={<div className="h-11 border-b border-zinc-800 bg-zinc-950" />}>
        <TopBar showSettings={true} onOpenLicenseModal={() => setShowLicenseModal(true)} />
      </Suspense>

      <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-800 bg-zinc-950/80">
        {([
          ['invoicing', tShell('invoicing') || 'Invoices'],
          ['contacts', tShell('contacts') || 'Contacts'],
          ['dashboard', tShell('chat') || 'Chat'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`px-3 py-1.5 rounded text-sm ${view === id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[10px] uppercase tracking-wider text-zinc-600 px-2">Invoicing only</span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <ErrorBoundary>
          {view === 'dashboard' && children}
          {view === 'contacts' && (
            <div className="h-full overflow-auto">
              <ContactsEmbed />
            </div>
          )}
          {view === 'invoicing' && (
            <div className="h-full overflow-auto">
              <InvoicingPanel />
            </div>
          )}
        </ErrorBoundary>
      </div>

      <LicenseModal
        isOpen={showLicenseModal}
        onClose={() => setShowLicenseModal(false)}
        onActivated={handleLicenseActivated}
      />
    </div>
  )
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="h-screen bg-zinc-950" />}>
      <AppContent>{children}</AppContent>
    </Suspense>
  )
}
