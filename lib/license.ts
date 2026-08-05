import { prisma } from '@/lib/prisma'

/** Same master unlock key as entrytwo (dev / support bypass). */
export const MASTER_LICENSE_KEY = 'FCKGW-RHQQ2-YXRKT-8TG6W-2B7Q8'

/** This app only accepts keys issued for this product (or master). */
export const LICENSE_PRODUCT = 'invoices' as const

export const TRIAL_DAYS = 30

export interface LicenseStatus {
  isLicensed: boolean
  daysRemaining: number | null
  firstUseAt: string | null
  acceptedKey?: string | null
}

export function getDaysSince(date: Date | string): number {
  const start = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

export function isWithinTrial(firstUseAt: string | null | undefined): boolean {
  if (!firstUseAt) return true
  return getDaysSince(firstUseAt) < TRIAL_DAYS
}

export async function verifyLicenseKey(key: string): Promise<boolean> {
  if (!key) return false
  if (key === MASTER_LICENSE_KEY) return true

  // "Verify once, trust forever" — only called from /api/license/activate.
  // Runtime uses stored license.acceptedKey only.
  // Sends product=invoices so entrytwo keys are rejected.
  const verifyUrl = process.env.LICENSE_VERIFY_URL
  if (verifyUrl) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, product: LICENSE_PRODUCT }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.ok) {
        const data = await res.json().catch(() => ({})) as {
          valid?: boolean
          product?: string
          master?: boolean
        }
        if (!data.valid) return false
        if (data.master) return true
        return data.product === LICENSE_PRODUCT
      }
    } catch {
      // network error → only master key works
    }
  }

  return false
}

export interface LicenseStatusResponse {
  firstUseAt: string | null
  daysRemaining: number
  inTrial: boolean
  isLicensed: boolean
  acceptedKey: string | null
}

export async function getLicenseStatus(): Promise<LicenseStatusResponse> {
  // Clear legacy "open mode" fake acceptance from earlier invoices builds
  const keySetting = await prisma.setting.findUnique({ where: { key: 'license.acceptedKey' } })
  let acceptedKey: string | null = null
  if (keySetting?.value && typeof keySetting.value === 'object' && keySetting.value !== null && 'value' in keySetting.value) {
    acceptedKey = (keySetting.value as { value?: string }).value || null
  } else if (typeof keySetting?.value === 'string') {
    acceptedKey = keySetting.value
  }
  if (acceptedKey === 'open') {
    await prisma.setting.delete({ where: { key: 'license.acceptedKey' } }).catch(() => {})
    acceptedKey = null
  }

  const firstUseSetting = await prisma.setting.findUnique({ where: { key: 'license.firstUseAt' } })
  let firstUseAt: string | null = null
  if (firstUseSetting?.value && typeof firstUseSetting.value === 'object' && firstUseSetting.value !== null && 'value' in firstUseSetting.value) {
    firstUseAt = (firstUseSetting.value as { value?: string }).value || null
  } else if (typeof firstUseSetting?.value === 'string') {
    firstUseAt = firstUseSetting.value
  }

  if (!firstUseAt) {
    firstUseAt = new Date().toISOString()
    await prisma.setting.upsert({
      where: { key: 'license.firstUseAt' },
      update: { value: { value: firstUseAt } },
      create: { key: 'license.firstUseAt', value: { value: firstUseAt } },
    })
  }

  const isLicensed = !!acceptedKey
  const inTrialWindow = isWithinTrial(firstUseAt)
  const daysUsed = firstUseAt ? getDaysSince(firstUseAt) : 0
  const daysRemaining = Math.max(0, TRIAL_DAYS - daysUsed)

  return {
    firstUseAt,
    daysRemaining,
    inTrial: inTrialWindow && !isLicensed,
    isLicensed,
    acceptedKey: isLicensed ? acceptedKey : null,
  }
}
