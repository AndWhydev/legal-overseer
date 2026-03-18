import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/portal/auth'
import { getPortalFiles, uploadPortalFile } from '@/lib/portal/data'

/**
 * GET /api/portal/files?slug=org-slug
 * Returns files visible to the portal user.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  const ctx = await getPortalContext(slug)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const files = await getPortalFiles(ctx)
  return NextResponse.json({ files })
}

/**
 * POST /api/portal/files?slug=org-slug
 * Upload a file from the portal.
 */
export async function POST(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  const ctx = await getPortalContext(slug)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!ctx.access.permissions.upload_files) {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const projectId = formData.get('project_id') as string | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // 50MB limit
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
  }

  const result = await uploadPortalFile(ctx, file, projectId || undefined)
  if (!result) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  return NextResponse.json({ file: result }, { status: 201 })
}
