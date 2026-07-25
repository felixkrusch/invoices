import { prisma } from '@/lib/prisma'

/**
 * LICENSE_MODE:
 * - open (default for private friend installs): no trial gate; always licensed
 * - trial: 30-day trial + optional key activation via LICENSE_VERIFY_URL / MASTER_LICENSE_KEY
 */
export function licenseMode(): 'open' | 'trial' {
  const raw = (process.env.LICENSE_MODE || 'open').toLowerCase().trim()
  return raw === 'trial' ? 'trial' : 'open'
}

export const MASTER_LICENSE_KEY = process.env.MASTER_LICENSE_KEY || ''

export const TRIAL_DAYS = 30

export function getDaysSince(date: Date | string): number {
  const start = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

export function isWithinTrial(firstUseAt: string | null | undefined): boolean {
  if (!firstUseAt) return true
  return getDaysSince(firstUseAt) < TRIAL_DAYS
}

export async function verifyLicenseKey(key: string): Promise<boolean> {
  if (!key) return false
  if (MASTER_LICENSE_KEY && key === MASTER_LICENSE_KEY) return true

  const verifyUrl = process.env.LICENSE_VERIFY_URL
  if (verifyUrl) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        return !!data.valid
      }
    } catch {
      // fall through
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
  mode: 'open' | 'trial'
}

export async function getLicenseStatus(): Promise<LicenseStatusResponse> {
  const mode = licenseMode()
  if (mode === 'open') {
    return {
      firstUseAt: null,
      daysRemaining: TRIAL_DAYS,
      inTrial: false,
      isLicensed: true,
      acceptedKey: 'open',
      mode,
    }
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

  let acceptedKey: string | null = null
  const keySetting = await prisma.setting.findUnique({ where: { key: 'license.acceptedKey' } })
  if (keySetting?.value && typeof keySetting.value === 'object' && keySetting.value !== null && 'value' in keySetting.value) {
    acceptedKey = (keySetting.value as { value?: string }).value || null
  } else if (typeof keySetting?.value === 'string') {
    acceptedKey = keySetting.value
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
    mode,
  }
}
