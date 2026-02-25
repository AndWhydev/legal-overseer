import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { queryInbox, getActiveThreads, type InboxFilters, type PriorityLevel, type MessageCategory, type ThreadStatus } from '@/lib/agent/channel-triage'

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return null
  return { supabase, orgId: profile.org_id }
}

/**
 * GET /api/agent/inbox — query unified inbox with filters
 * Query params: channel, priority, category, status, threadStatus, limit, offset
 */
export async function GET(request: NextRequest) {
  const ctx = await getOrgContext()
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
export async function POST() {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const threads = await getActiveThreads(ctx.supabase, ctx.orgId)
  return NextResponse.json({ threads })
}
