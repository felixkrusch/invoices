'use client'

import { ReactNode, Suspense, useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import toast from 'react-hot-toast'
import TopBar from './TopBar'
import InvoicingPanel from './InvoicingPanel'
import ContactsPanel from './ContactsPanel'
import LicenseGate from './LicenseGate'
import LicenseModal from './LicenseModal'
import { ErrorBoundary } from '../components/ErrorBoundary'

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
  // Right panel: invoicing (default) or contacts. Chat is always the left column.
  const view = (rawView === 'contacts' ? 'contacts' : 'invoicing') as 'contacts' | 'invoicing'

  useEffect(() => {
    if (rawView && !['dashboard', 'contacts', 'invoicing', ''].includes(rawView)) {
      router.replace('/app?view=invoicing')
    }
  }, [rawView, router])

  useEffect(() => {
    // Chat may open contacts/invoicing via custom events
    const openContacts = () => {
      const params = new URLSearchParams(searchParams?.toString() || '')
      params.set('view', 'contacts')
      router.push(`/app?${params.toString()}`)
    }
    const openInvoicing = () => {
      const params = new URLSearchParams(searchParams?.toString() || '')
      params.set('view', 'invoicing')
      router.push(`/app?${params.toString()}`)
    }
    window.addEventListener('open-contacts', openContacts)
    window.addEventListener('open-invoicing', openInvoicing)
    return () => {
      window.removeEventListener('open-contacts', openContacts)
      window.removeEventListener('open-invoicing', openInvoicing)
    }
  }, [router, searchParams])

  useEffect(() => {
    fetch('/api/bootstrap/status')
      .then(r => r.json())
      .then(d => setNeedsBootstrap(!!d.needsBootstrap))
      .catch(() => setNeedsBootstrap(false))
  }, [])

  useEffect(() => {
    if (needsBootstrap) router.replace('/auth/signin')
  }, [needsBootstrap, router])

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
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        {tShell('checkingSetup') || 'Loading…'}
      </div>
    )
  }

  if (needsBootstrap) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        {tShell('openingSetup') || 'Opening setup…'}
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-200">
      <div className="no-print shrink-0">
        <Suspense fallback={<div className="h-11 border-b border-zinc-800 bg-zinc-950" />}>
          <TopBar showSettings={true} onOpenLicenseModal={() => setShowLicenseModal(true)} />
        </Suspense>
      </div>

      {/* Split: chat left · workspace right (chat left, workspace right) */}
      <div className="flex min-h-0 flex-1">
        <div className="no-print flex w-full flex-col border-r border-zinc-800 md:w-2/5">
          {children}
        </div>

        <div className="hidden min-h-0 flex-1 overflow-auto bg-zinc-900 p-4 md:block md:p-6">
          <div className="mx-auto max-w-5xl space-y-6">
            <ErrorBoundary>
              {view === 'contacts' ? <ContactsPanel /> : <InvoicingPanel />}
            </ErrorBoundary>
          </div>
        </div>
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
