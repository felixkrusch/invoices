'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

type UpdateStatus = {
  updateAvailable: boolean
  currentCommit: string
  latestCommit: string
}

export default function AdminOverview() {
  const t = useTranslations('app.adminPages')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/admin/update')
        if (res.ok) setUpdateStatus(await res.json())
      } catch { /* ignore */ }
    }
    void check()
  }, [])

  const cards = [
    { href: '/admin/company', title: t('companyTitle') || 'Company', desc: t('companyDesc') || 'Name, currency, branding' },
    { href: '/admin/tax', title: t('taxTitle') || 'Tax rates', desc: t('taxDesc') || 'Rates used on invoice lines' },
    { href: '/admin/users', title: t('usersTitle') || 'Users', desc: t('usersDesc') || 'Invites and roles' },
    { href: '/admin/ai', title: t('aiTitle') || 'AI', desc: t('aiDesc') || 'LLM provider for chat' },
    { href: '/admin/backup', title: 'Backup', desc: 'Export and restore data' },
    { href: '/admin/update', title: 'System update', desc: 'Apply application updates', badge: updateStatus?.updateAvailable },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">{t('overviewTitle') || 'Admin'}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {t('overviewSubtitle') || 'Configure your invoicing workspace.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map(card => (
          <Link
            key={card.href}
            href={card.href}
            className="block border border-zinc-800 rounded-lg p-5 hover:border-zinc-700 transition-colors bg-zinc-950 relative"
          >
            <div className="font-medium mb-1">{card.title}</div>
            <div className="text-xs text-zinc-500">{card.desc}</div>
            {card.badge && (
              <div className="absolute top-2 right-2 w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
