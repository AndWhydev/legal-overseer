import type { SupabaseClient } from '@supabase/supabase-js'
import type { Goal, Task, ActivityEntry } from '@/lib/types'

export interface AppContext {
  goals: Goal[]
  tasks: Task[]
  contacts: { name: string; slug: string; type: string }[]
  recentActivity: ActivityEntry[]
  columns: { id: string; title: string }[]
}

export interface LoadContextOptions {
  /** Only include tasks in active columns (exclude Backlog/Done) */
  activeTasksOnly?: boolean
  /** Max tasks to include in prompt context */
  taskLimit?: number
  /** Max contacts to include — prioritizes those with recent activity */
  contactLimit?: number
}

export async function loadContext(
  supabase: SupabaseClient,
  orgId: string,
  options?: LoadContextOptions,
): Promise<AppContext> {
  const taskLimit = options?.taskLimit ?? 50
  const contactLimit = options?.contactLimit

  const [goalsRes, tasksRes, columnsRes, activityRes] = await Promise.all([
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
      .limit(taskLimit),
    supabase
      .from('kanban_columns')
      .select('id, title')
      .eq('org_id', orgId)
      .order('position'),
    supabase
      .from('activity_feed')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  let tasks = (tasksRes.data ?? []) as Task[]
  const columns = (columnsRes.data ?? []) as { id: string; title: string }[]

  // Filter to active columns only (exclude Backlog and Done)
  if (options?.activeTasksOnly) {
    const activeColumnTitles = ['to do', 'in progress', 'review']
    const activeColumnIds = new Set(
      columns
        .filter(c => activeColumnTitles.includes(c.title.toLowerCase()))
        .map(c => c.id),
    )
    tasks = tasks.filter(t => t.column_id && activeColumnIds.has(t.column_id))
  }

  // Load contacts — with optional limit prioritizing recently active contacts
  let contacts: { name: string; slug: string; type: string }[]
  if (contactLimit) {
    // Get contacts that have recent entity_relationships or timeline events
    const { data: activeContactIds } = await supabase
      .from('entity_relationships')
      .select('entity_id')
      .eq('org_id', orgId)
      .eq('entity_type', 'contact')
      .order('updated_at', { ascending: false })
      .limit(contactLimit)

    const activeIds = new Set((activeContactIds ?? []).map(r => r.entity_id))

    const contactsRes = await supabase
      .from('contacts')
      .select('name, slug, type')
      .eq('org_id', orgId)
      .order('name')

    const allContacts = (contactsRes.data ?? []) as { name: string; slug: string; type: string }[]

    // Prioritize contacts with active relationships, then fill remaining slots
    const active = allContacts.filter(c => activeIds.has((c as Record<string, unknown>).id as string))
    const rest = allContacts.filter(c => !activeIds.has((c as Record<string, unknown>).id as string))
    contacts = [...active, ...rest].slice(0, contactLimit)
  } else {
    const contactsRes = await supabase
      .from('contacts')
      .select('name, slug, type')
      .eq('org_id', orgId)
      .order('name')
    contacts = (contactsRes.data ?? []) as { name: string; slug: string; type: string }[]
  }

  return {
    goals: (goalsRes.data ?? []) as Goal[],
    tasks,
    contacts,
    recentActivity: (activityRes.data ?? []) as ActivityEntry[],
    columns,
  }
}
