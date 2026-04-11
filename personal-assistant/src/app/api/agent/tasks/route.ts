import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveTasks, listTasks } from '@/lib/agent/tasks'

async function getAuthContext(request?: NextRequest) {
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

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request)
  if ('error' in auth) return auth.error

  const status = request.nextUrl.searchParams.get('status') ?? undefined
  const taskType = request.nextUrl.searchParams.get('task_type') ?? undefined
  const threadId = request.nextUrl.searchParams.get('thread_id')
  const activeOnly = request.nextUrl.searchParams.get('active') === 'true'

  try {
    if (activeOnly) {
      const tasks = await getActiveTasks(auth.supabase, auth.orgId)
      return NextResponse.json({ tasks })
    }

    // If thread_id filter requested, query directly with thread scoping
    if (threadId) {
      const { data, error } = await auth.supabase
        .from('execution_tasks')
        .select('*')
        .eq('org_id', auth.orgId)
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ tasks: data ?? [] })
    }

    const tasks = await listTasks(auth.supabase, auth.orgId, { status, task_type: taskType })
    return NextResponse.json({ tasks })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch tasks'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
