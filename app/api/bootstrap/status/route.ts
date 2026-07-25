import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      needsBootstrap: true,
      databaseConfigured: false,
      error: 'DATABASE_URL is not set. Copy .env.example to .env and configure Postgres.',
    })
  }
  try {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
    return NextResponse.json({
      needsBootstrap: adminCount === 0,
      databaseConfigured: true,
      adminCount,
    })
  } catch (error) {
    // Prefer first-admin UI over normal login when DB is empty/unreachable —
    // onboarding will surface the real connection error.
    return NextResponse.json({
      needsBootstrap: true,
      databaseConfigured: true,
      error: error instanceof Error ? error.message : 'Database unavailable',
    })
  }
}
