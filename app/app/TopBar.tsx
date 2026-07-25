'use client'

import { useEffect, useState, useRef } from 'react'
import { Settings, FileText, Users, ChevronDown, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { signOut } from '@/lib/auth-client'

interface TopBarProps {
  showSettings?: boolean
  onOpenLicenseModal?: () => void
}

interface LicenseStatus {
  daysRemaining: number
  inTrial: boolean
  isLicensed: boolean
}

export default function TopBar({ showSettings = false, onOpenLicenseModal }: TopBarProps) {
  const t = useTranslations('app.nav')
  const tAdmin = useTranslations('app.adminNav')
  const [isAdmin, setIsAdmin] = useState(false)
  const [license, setLicense] = useState<LicenseStatus | null>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const loadLicense = () => {
    fetch('/api/license/status')
      .then(r => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return
        setLicense({
          daysRemaining: d.daysRemaining ?? 0,
          inTrial: !!d.inTrial,
          isLicensed: !!d.isLicensed,
        })
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadLicense()
    const handler = () => loadLicense()
    window.addEventListener('license-updated', handler)
    return () => window.removeEventListener('license-updated', handler)
  }, [])

  // Right-panel views only — chat is always visible on the left
  const navItems = [
    { name: t('invoicing') || 'Invoices', view: 'invoicing', icon: FileText },
    { name: t('contacts') || 'Contacts', view: 'contacts', icon: Users },
  ]

  useEffect(() => {
    if (!showSettings) return
    fetch('/api/me')
      .then(r => r.json())
      .then(d => setIsAdmin(!!d?.isAdmin))
      .catch(() => setIsAdmin(false))
  }, [showSettings])

  const viewParam = (searchParams.get('view') || 'invoicing').trim().toLowerCase()
  const isAppRoot = pathname?.startsWith('/app') ?? false

  const isActive = (itemView: string) => {
    if (!isAppRoot) return false
    if (itemView === 'invoicing') return viewParam !== 'contacts'
    return viewParam === itemView
  }

  const [showAdminMenu, setShowAdminMenu] = useState(false)
  const adminMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) {
        setShowAdminMenu(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAdminMenu(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [])

  const showTrialButton = license && license.inTrial && !license.isLicensed

  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4">
      <div className="flex items-center gap-2">
        <Link href="/app?view=invoicing" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <img src="/invoices-logo.svg" alt="invoices" className="h-5 w-auto" />
        </Link>

        {showTrialButton && (
          <button
            type="button"
            onClick={() => onOpenLicenseModal?.()}
            className="ml-4 rounded border border-amber-800 bg-amber-900/30 px-1 text-[10px] text-amber-400 transition-colors hover:bg-amber-900/50"
          >
            {t('trialDays', { days: license!.daysRemaining }) || `Trial: ${license!.daysRemaining}d`}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.view)
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => router.push(`/app?view=${item.view}`)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                  active ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
                title={item.name}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.name}
              </button>
            )
          })}
        </nav>

        {showSettings && (
          <div className="relative" ref={adminMenuRef}>
            <button
              type="button"
              onClick={() => setShowAdminMenu(v => !v)}
              className="flex items-center gap-1 rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              title={t('settings') || 'Settings'}
              aria-haspopup="menu"
              aria-expanded={showAdminMenu}
            >
              <Settings className="h-4 w-4" />
              <ChevronDown className="h-3 w-3" />
            </button>

            {showAdminMenu && (
              <div className="absolute right-0 z-50 mt-2 w-56 rounded-md border border-zinc-800 bg-zinc-950 py-1 text-sm shadow-xl">
                {isAdmin && (
                  <>
                    <Link href="/admin" className="block px-3 py-1.5 text-zinc-200 hover:bg-zinc-900" onClick={() => setShowAdminMenu(false)}>
                      {tAdmin('overview') || 'Admin'}
                    </Link>
                    <Link href="/admin/company" className="block px-3 py-1.5 text-zinc-300 hover:bg-zinc-900" onClick={() => setShowAdminMenu(false)}>
                      {tAdmin('company') || 'Company'}
                    </Link>
                    <Link href="/admin/tax" className="block px-3 py-1.5 text-zinc-300 hover:bg-zinc-900" onClick={() => setShowAdminMenu(false)}>
                      {tAdmin('tax') || 'Tax rates'}
                    </Link>
                    <Link href="/admin/users" className="block px-3 py-1.5 text-zinc-300 hover:bg-zinc-900" onClick={() => setShowAdminMenu(false)}>
                      {tAdmin('users') || 'Users'}
                    </Link>
                    <Link href="/admin/ai" className="block px-3 py-1.5 text-zinc-300 hover:bg-zinc-900" onClick={() => setShowAdminMenu(false)}>
                      {tAdmin('ai') || 'AI'}
                    </Link>
                    <Link href="/admin/backup" className="block px-3 py-1.5 text-zinc-300 hover:bg-zinc-900" onClick={() => setShowAdminMenu(false)}>
                      {tAdmin('backup') || 'Backup'}
                    </Link>
                    <Link href="/admin/update" className="block px-3 py-1.5 text-zinc-300 hover:bg-zinc-900" onClick={() => setShowAdminMenu(false)}>
                      {tAdmin('update') || 'Update'}
                    </Link>
                    <div className="my-1 border-t border-zinc-800" />
                  </>
                )}

                {onOpenLicenseModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminMenu(false)
                      onOpenLicenseModal()
                    }}
                    className="w-full px-3 py-1.5 text-left text-zinc-300 hover:bg-zinc-900"
                  >
                    {t('license') || 'License'}
                  </button>
                )}

                <div className="my-1 border-t border-zinc-800" />
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminMenu(false)
                    void signOut({ callbackUrl: '/auth/signin' })
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-zinc-300 hover:bg-zinc-900"
                >
                  <LogOut className="h-4 w-4" />
                  {t('signOut') || 'Sign out'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
