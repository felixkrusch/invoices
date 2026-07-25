import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/authz'
import { canAccessFileAsset } from '@/lib/fileAccess'
import { readAttachment } from '@/lib/attachments'
import { logger } from '@/lib/logger'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireUser()
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  const { id } = await params
  try {
    const asset = await prisma.fileAsset.findUnique({ where: { id } })
    if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!canAccessFileAsset({
      userId: session.user.id,
      role: session.user.role,
      createdById: asset.createdById,
    })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const buffer = await readAttachment(asset.storageKey)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': asset.mimeType,
        'Content-Disposition': `inline; filename="${asset.originalName.replace(/"/g, '')}"`,
        'Content-Length': String(asset.size),
      },
    })
  } catch (error) {
    logger.error('file read failed', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 })
  }
}
