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

interface ContextContact {
  id?: string
  name: string
  slug: string
  type: string
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
        .filter(c => activeColumnTitles.includes((c.title ?? '').toLowerCase()))
        .map(c => c.id),
    )
    tasks = tasks.filter(t => t.column_id && activeColumnIds.has(t.column_id))
  }

  // Load contacts — prioritized by recent communication, not just entity_relationships.
  // Strategy: score contacts by recency of timeline events, then fill remaining alphabetically.
  // Excludes automated/no-reply senders that clutter the working set.
  let contacts: { name: string; slug: string; type: string }[]
  const effectiveContactLimit = contactLimit ?? 20

  // Get contacts with recent timeline activity (most relevant for context)
  const [recentTimelineRes, allContactsRes] = await Promise.all([
    supabase
      .from('entity_timeline')
      .select('entity_id')
      .eq('org_id', orgId)
      .eq('entity_type', 'contact')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('contacts')
      .select('id, name, slug, type, emails')
      .eq('org_id', orgId)
      .order('name'),
  ])

  const allContacts = (allContactsRes.data ?? []) as (ContextContact & { emails?: string[] })[]

  // Filter out automated/no-reply contacts that add noise to the working set.
  // Uses email patterns (no-reply, noreply, mailer-daemon) rather than hardcoded brand names.
  // Contacts explicitly typed as 'person' or 'business' are always included.
  const isAutomated = (c: typeof allContacts[0]) => {
    // Never filter contacts the user has explicitly categorized
    if (c.type === 'person' || c.type === 'business') return false
    const emailLower = ((c.emails || [])[0] || '').toLowerCase()
    return emailLower.includes('no-reply') ||
           emailLower.includes('noreply') ||
           emailLower.includes('donotreply') ||
           emailLower.includes('mailer-daemon') ||
           emailLower.includes('notifications@') ||
           emailLower.includes('updates@')
  }

  const humanContacts = allContacts.filter(c => !isAutomated(c))

  // Score by recency: contacts appearing more recently in timeline get priority
  const recentEntityIds = (recentTimelineRes.data ?? []).map(r => r.entity_id)
  const recencyScore = new Map<string, number>()
  recentEntityIds.forEach((id, index) => {
    if (!recencyScore.has(id)) recencyScore.set(id, 100 - index) // higher = more recent
  })

  const scored = humanContacts.map(c => ({
    ...c,
    score: recencyScore.get(String(c.id ?? '')) ?? 0,
  }))
  scored.sort((a, b) => b.score - a.score)

  contacts = scored
    .slice(0, effectiveContactLimit)
    .map(({ id: _id, emails: _emails, score: _score, ...contact }) => contact)

  return {
    goals: (goalsRes.data ?? []) as Goal[],
    tasks,
    contacts,
    recentActivity: (activityRes.data ?? []) as ActivityEntry[],
    columns,
  }
}
