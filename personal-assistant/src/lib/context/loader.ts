import { createClient } from '@/lib/supabase/server'
import type { Goal, Task, ActivityEntry } from '@/lib/types'

export interface AppContext {
  goals: Goal[]
  tasks: Task[]
  contacts: { name: string; slug: string; type: string }[]
  recentActivity: ActivityEntry[]
  columns: { id: string; title: string }[]
}

export async function loadContext(orgId: string): Promise<AppContext> {
  const supabase = await createClient()
  if (!supabase) return { goals: [], tasks: [], contacts: [], recentActivity: [], columns: [] }

  const [goalsRes, tasksRes, contactsRes, activityRes, columnsRes] = await Promise.all([
    supabase
      .from('goals')
      .select('*')
      .eq('org_id', orgId)
      .in('status', ['active', 'blocked'])
      .order('priority'),
    supabase
      .from('tasks')
      .select('*')
      .eq('org_id', orgId)
      .neq('status', 'archived')
      .order('position')
      .limit(50),
    supabase
      .from('contacts')
      .select('name, slug, type')
      .eq('org_id', orgId)
      .order('name'),
    supabase
      .from('activity_feed')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('kanban_columns')
      .select('id, title')
      .eq('org_id', orgId)
      .order('position'),
  ])

  return {
    goals: (goalsRes.data ?? []) as Goal[],
    tasks: (tasksRes.data ?? []) as Task[],
    contacts: (contactsRes.data ?? []) as { name: string; slug: string; type: string }[],
    recentActivity: (activityRes.data ?? []) as ActivityEntry[],
    columns: (columnsRes.data ?? []) as { id: string; title: string }[],
  }
}
