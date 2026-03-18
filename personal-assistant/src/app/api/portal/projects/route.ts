import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/portal/auth'
import { getPortalProjects } from '@/lib/portal/data'

/**
 * GET /api/portal/projects?slug=org-slug
 * Returns projects visible to the portal user.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  const ctx = await getPortalContext(slug)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!ctx.access.permissions.view_projects) {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  const projects = await getPortalProjects(ctx)
  return NextResponse.json({ projects })
}
