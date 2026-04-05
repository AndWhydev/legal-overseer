import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { queryInbox, getActiveThreads, type InboxFilters, type PriorityLevel, type MessageCategory, type ThreadStatus } from '@/lib/agent/channel-triage'

/**
 * GET /api/agent/inbox — query unified inbox with filters
 * Query params: channel, priority, category, status, threadStatus, limit, offset
 */
export async function GET(request: NextRequest) {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>
  try {
    ctx = await getAuthContext(request)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = request.nextUrl.searchParams

  const filters: InboxFilters = {}
  if (params.get('channel')) filters.channel = params.get('channel') as string
  if (params.get('priority')) filters.priority = params.get('priority') as PriorityLevel
  if (params.get('category')) filters.category = params.get('category') as MessageCategory
  if (params.get('status')) filters.status = params.get('status') as 'unread' | 'actioned' | 'archived'
  if (params.get('threadStatus')) filters.threadStatus = params.get('threadStatus') as ThreadStatus
  if (params.get('limit')) filters.limit = parseInt(params.get('limit') as string, 10)
  if (params.get('offset')) filters.offset = parseInt(params.get('offset') as string, 10)

  const result = await queryInbox(ctx.supabase, ctx.orgId, filters)
  return NextResponse.json(result)
}

/**
 * POST /api/agent/inbox/threads — get active conversation threads
 */
export async function POST(request: NextRequest) {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>
  try {
    ctx = await getAuthContext(request)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const threads = await getActiveThreads(ctx.supabase, ctx.orgId)
  return NextResponse.json({ threads })
}
