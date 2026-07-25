import { prisma } from '@/lib/prisma'

export interface CompanyProfile {
  name?: string
  baseCurrency: string
  defaultLanguage?: string
  country?: string
  region?: string
  defaultTaxJurisdiction?: string
}

/**
 * Returns the authoritative company profile / system facts.
 * This is the single source the AI should use for tax decisions and context.
 *
 * These values come from the app (Settings), not from the user's chat or the model.
 * They are injected into both execution and advisory paths.
 */
export async function getCompanyProfile(): Promise<CompanyProfile> {
  const profile: CompanyProfile = {
    baseCurrency: 'EUR',
  }

  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: [
            'company.address',
            'company.name',
            'companyName',
            'defaultTaxJurisdiction',
            'baseCurrency',
            'company.defaultLanguage',
          ],
        },
      },
    })
    const byKey = Object.fromEntries(settings.map(s => [s.key, s.value]))

    const unwrap = (v: unknown): string | undefined => {
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (v && typeof v === 'object' && 'value' in (v as object)) {
        const inner = (v as { value?: unknown }).value
        if (typeof inner === 'string' && inner.trim()) return inner.trim()
      }
      return undefined
    }

    const addr = byKey['company.address'] as { region?: string; country?: string } | null
    const jur = unwrap(byKey['defaultTaxJurisdiction'])
    const bc = unwrap(byKey['baseCurrency'])
    const name = unwrap(byKey['company.name']) || unwrap(byKey['companyName'])
    const lang = unwrap(byKey['company.defaultLanguage'])

    if (name) profile.name = name
    if (lang) profile.defaultLanguage = lang === 'de' ? 'de' : 'en'

    if (addr?.region) {
      profile.region = String(addr.region).toUpperCase()
    } else if (jur) {
      profile.region = String(jur).toUpperCase()
    }

    if (addr?.country) {
      profile.country = String(addr.country).toUpperCase()
    } else if (profile.region) {
      profile.country = profile.region.split('-')[0]
    }

    if (jur) {
      profile.defaultTaxJurisdiction = String(jur).toUpperCase()
    }

    if (bc) {
      profile.baseCurrency = bc.toUpperCase()
    }
  } catch {
    // Fail soft — return defaults. The advisory path will still work but should note limited company data.
  }

  return profile
}
