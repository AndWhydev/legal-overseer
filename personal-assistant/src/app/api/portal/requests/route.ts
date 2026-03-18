import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/portal/auth'
import { getPortalRequests, createPortalRequest } from '@/lib/portal/data'

/**
 * GET /api/portal/requests?slug=org-slug
 * Returns requests submitted by the portal user.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  const ctx = await getPortalContext(slug)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requests = await getPortalRequests(ctx)
  return NextResponse.json({ requests })
}

/**
 * POST /api/portal/requests?slug=org-slug
 * Submit a new request from the portal.
 */
export async function POST(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  const ctx = await getPortalContext(slug)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!ctx.access.permissions.submit_requests) {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  const body = await request.json()
  const { title, description, type, priority, project_id } = body

  if (!title || !type) {
    return NextResponse.json({ error: 'title and type required' }, { status: 400 })
  }

  const validTypes = ['change_request', 'bug_report', 'question', 'feedback']
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const result = await createPortalRequest(ctx, {
    title,
    description,
    type,
    priority,
    project_id,
  })

  if (!result) {
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
  }

  return NextResponse.json({ request: result }, { status: 201 })
}
