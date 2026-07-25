import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const DEFAULT_LIMIT = 60
const AUTH_LIMIT = 120

/**
 * Returns a 429 response when over limit, otherwise null.
 * Fails open (null) if the database is unreachable so auth/session
 * never returns an empty body that breaks next-auth/react JSON.parse.
 */
export async function rateLimit(
  request: NextRequest,
  options?: { keyPrefix?: string; limit?: number; windowMs?: number },
): Promise<NextResponse | null> {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'

    const hasAuth =
      request.cookies.has('authjs.session-token')
      || request.cookies.has('authjs.session_token')
      || request.cookies.has('__Secure-authjs.session-token')

    const limit = options?.limit ?? (hasAuth ? AUTH_LIMIT : DEFAULT_LIMIT)
    const windowMs = options?.windowMs ?? 60_000
    const now = new Date()
    const key = `${options?.keyPrefix || request.nextUrl.pathname}:${ip}`

    const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
      VALUES (${key}, 1, ${new Date(now.getTime() + windowMs)}, NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN ${new Date(now.getTime() + windowMs)} ELSE "RateLimitBucket"."resetAt" END,
        "updatedAt" = NOW()
      RETURNING "count", "resetAt"
    `
    const entry = rows[0]
    if (entry && entry.count > limit) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((entry.resetAt.getTime() - now.getTime()) / 1000))),
          },
        },
      )
    }
    return null
  } catch (error) {
    logger.warn('rateLimit failed open', {
      error: error instanceof Error ? error.message : String(error),
      path: request.nextUrl.pathname,
    })
    return null
  }
}
