import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPendingApprovals, resolveApproval } from '@/lib/agent/approval-queue'
import { executeApprovedAction } from '@/lib/agent/action-executor'
import { logAuditEvent } from '@/lib/audit/logger'

type Decision = 'approved' | 'rejected'

const VALID_PRIORITIES = new Set(['urgent', 'normal', 'low'])

async function getUserOrgId() {
  const supabase = await createClient()
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Not configured' }, { status: 503 }) as Response }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as Response }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return { error: NextResponse.json({ error: 'No profile found' }, { status: 400 }) as Response }
  }

  return { supabase, userId: user.id, orgId: profile.org_id }
}

export async function GET(request: NextRequest) {
  const auth = await getUserOrgId()
  if ('error' in auth) {
    return auth.error
  }

  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '20')
  const offsetParam = Number(request.nextUrl.searchParams.get('offset') ?? '0')
  const priorityParam = request.nextUrl.searchParams.get('priority')

  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0

  let priorityFilter: 'urgent' | 'normal' | 'low' | undefined
  if (priorityParam) {
    if (!VALID_PRIORITIES.has(priorityParam)) {
      return NextResponse.json({ error: 'Invalid priority filter' }, { status: 400 })
    }
    priorityFilter = priorityParam as 'urgent' | 'normal' | 'low'
  }

  try {
    const approvals = await getPendingApprovals(auth.supabase, auth.orgId, {
      limit,
      offset,
      priorityFilter,
    })

    return NextResponse.json({ approvals })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch approvals'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getUserOrgId()
  if ('error' in auth) {
    return auth.error
  }

  let body: { approvalId?: string; decision?: Decision }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.approvalId || !body.decision || !['approved', 'rejected'].includes(body.decision)) {
    return NextResponse.json(
      { error: 'approvalId and decision (approved|rejected) are required' },
      { status: 400 },
    )
  }

  try {
    const approval = await resolveApproval(
      auth.supabase,
      body.approvalId,
      body.decision,
      auth.userId,
      'dashboard',
    )

    await logAuditEvent(auth.supabase, {
      orgId: auth.orgId,
      actorType: 'user',
      actorId: auth.userId,
      action: body.decision === 'approved' ? 'approved' : 'rejected',
      entityType: 'approval',
      entityId: body.approvalId,
      metadata: { decision: body.decision, source: 'dashboard' },
    })

    // Fire-and-forget execution for approved actions
    // resolveApproval also triggers this, but the idempotency guard in
    // executeApprovedAction prevents double-execution.
    if (body.decision === 'approved') {
      executeApprovedAction(auth.supabase, approval).catch(() => {
        // Errors handled inside executeApprovedAction
      })
    }

    return NextResponse.json({ approval })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve approval'

    if (message === 'APPROVAL_NOT_FOUND') {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }

    if (message === 'APPROVAL_ALREADY_RESOLVED') {
      return NextResponse.json({ error: 'Approval already resolved' }, { status: 409 })
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
