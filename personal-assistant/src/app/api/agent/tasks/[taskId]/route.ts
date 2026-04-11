import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTaskWithSteps, cancelTask } from '@/lib/agent/tasks'
import { logger } from '@/lib/core/logger'

async function getAuthContext() {
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

  return { supabase, orgId: profile.org_id }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const { taskId } = await context.params
  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  try {
    const result = await getTaskWithSteps(auth.supabase, taskId)

    if (!result) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Ensure the task belongs to this org
    if (result.task.org_id !== auth.orgId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (err) {
    logger.error('[api/agent/tasks/detail] GET failed', { taskId, err })
    const message = err instanceof Error ? err.message : 'Failed to fetch task'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const { taskId } = await context.params
  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  let body: { action?: string }
  try {
    body = (await request.json()) as { action?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.action !== 'cancel') {
    return NextResponse.json({ error: 'action must be "cancel"' }, { status: 400 })
  }

  try {
    // Verify ownership before cancelling
    const existing = await getTaskWithSteps(auth.supabase, taskId)
    if (!existing || existing.task.org_id !== auth.orgId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const task = await cancelTask(auth.supabase, taskId, 'user')
    return NextResponse.json({ task })
  } catch (err) {
    logger.error('[api/agent/tasks/detail] PATCH failed', { taskId, err })
    const message = err instanceof Error ? err.message : 'Failed to cancel task'

    if (message.startsWith('TASK_NOT_CANCELLABLE')) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    if (message === 'TASK_NOT_FOUND') {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
