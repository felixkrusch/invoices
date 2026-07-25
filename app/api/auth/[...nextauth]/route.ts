import { handlers } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function run(
  request: NextRequest,
  method: 'GET' | 'POST',
) {
  try {
    const limited = await rateLimit(request, {
      keyPrefix: method === 'GET' ? 'auth-get' : 'auth-post',
      limit: method === 'GET' ? 120 : 30,
      windowMs: 10 * 60_000,
    })
    if (limited) return limited

    const response = method === 'GET'
      ? await handlers.GET(request)
      : await handlers.POST(request)

    // Auth.js must never return an empty body to the browser client.
    if (!response) {
      return NextResponse.json({ error: 'Auth handler returned empty response' }, { status: 500 })
    }
    return response
  } catch (error) {
    logger.error('auth route error', {
      error: error instanceof Error ? error.message : String(error),
      method,
      path: request.nextUrl.pathname,
    })
    // Session poll expects JSON; never return empty 500 HTML/text.
    return NextResponse.json(
      { error: 'Authentication service unavailable', message: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  return run(request, 'GET')
}

export async function POST(request: NextRequest) {
  return run(request, 'POST')
}
