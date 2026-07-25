import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import type { Prisma } from '@prisma/client'

const onboardingSchema = z.object({
  email: z.string().email(),
  name: z.string().max(100).optional(),
  companyName: z.string().min(1),
  baseCurrency: z.string().length(3),
  defaultTaxJurisdiction: z.string().optional(),
  defaultLanguage: z.enum(['en', 'de']).default('en'),
})

function normalizeLocale(v?: string) {
  return v === 'de' ? 'de' : 'en'
}

export async function GET() {
  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['companyName', 'baseCurrency', 'defaultTaxJurisdiction', 'company.defaultLanguage'] } },
  })

  const config = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  const langRaw = config['company.defaultLanguage'] as { value?: string } | string | undefined
  const langVal =
    typeof langRaw === 'object' && langRaw && 'value' in langRaw
      ? langRaw.value
      : typeof langRaw === 'string'
        ? langRaw
        : 'en'

  return NextResponse.json({
    needsBootstrap: adminCount === 0,
    config: {
      companyName: (typeof config.companyName === 'string' ? config.companyName : '') || '',
      baseCurrency: (() => {
        const c = config.baseCurrency as { value?: string } | string | undefined
        if (typeof c === 'object' && c && 'value' in c) return c.value || 'EUR'
        if (typeof c === 'string') return c
        return 'EUR'
      })(),
      defaultTaxJurisdiction: (() => {
        const c = config.defaultTaxJurisdiction as { value?: string } | string | undefined
        if (typeof c === 'object' && c && 'value' in c) return c.value || ''
        if (typeof c === 'string') return c
        return ''
      })(),
      defaultLanguage: normalizeLocale(langVal),
    },
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = onboardingSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
    }

    const {
      companyName,
      baseCurrency,
      defaultTaxJurisdiction,
      defaultLanguage,
      email,
      name,
    } = parsed.data
    const locale = normalizeLocale(defaultLanguage)

    const user = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_advisory_xact_lock(hashtext('invoices-bootstrap')) IS NULL AS locked`
      const adminCount = await tx.user.count({ where: { role: 'ADMIN' } })
      if (adminCount > 0) throw new Error('BOOTSTRAP_COMPLETE')

      const createdUser = await tx.user.create({ data: { email, name, role: 'ADMIN' } })

      const upsertSetting = async (key: string, value: Prisma.InputJsonValue) => {
        await tx.setting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        })
      }

      await upsertSetting('companyName', companyName)
      await upsertSetting('company.name', { value: companyName })
      await upsertSetting('baseCurrency', { value: baseCurrency })
      await upsertSetting('company.defaultLanguage', { value: locale })
      if (defaultTaxJurisdiction) {
        await upsertSetting('defaultTaxJurisdiction', { value: defaultTaxJurisdiction })
      }

      const defaultTaxes: Array<{ jurisdiction: string; name: string; rate: number; taxType: string }> = [
        { jurisdiction: 'DE', name: 'MwSt 19%', rate: 0.19, taxType: 'STANDARD' },
        { jurisdiction: 'DE', name: 'MwSt 7%', rate: 0.07, taxType: 'REDUCED' },
        { jurisdiction: 'AT', name: 'USt 20%', rate: 0.2, taxType: 'STANDARD' },
      ]
      for (const tax of defaultTaxes) {
        await tx.taxRate.create({ data: tax })
      }

      return createdUser
    })

    return NextResponse.json({ ok: true, userId: user.id })
  } catch (error) {
    if (error instanceof Error && error.message === 'BOOTSTRAP_COMPLETE') {
      return NextResponse.json({ error: 'Already bootstrapped' }, { status: 409 })
    }
    logger.error('onboarding failed', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Onboarding failed' }, { status: 500 })
  }
}
