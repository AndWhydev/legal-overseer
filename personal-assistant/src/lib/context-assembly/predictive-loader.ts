import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

export interface PredictiveContext {
  text: string
  entityNodeIds: string[]
  tokenEstimate: number
}

const EMPTY: PredictiveContext = { text: '', entityNodeIds: [], tokenEstimate: 0 }

export async function loadPredictiveContext(
  supabase: SupabaseClient,
  orgId: string,
): Promise<PredictiveContext> {
  try {
    const now = new Date()
    const fourHoursAgo = new Date(now.getTime() - 4 * 3600_000).toISOString()
    const fortyEightHoursAhead = new Date(now.getTime() + 48 * 3600_000).toISOString()

    // Parallel fetch all signals
    const [deadlines, recentActivity, pendingApprovals, briefing] = await Promise.allSettled([
      // 1. Entities with upcoming deadlines (next 48h)
      supabase
        .from('event_tuples')
        .select('subject_id, verb, object_text, occurred_at')
        .eq('org_id', orgId)
        .gte('occurred_at', now.toISOString())
        .lte('occurred_at', fortyEightHoursAhead)
        .order('occurred_at', { ascending: true })
        .limit(10),

      // 2. Entities with recent activity (last 4h)
      supabase
        .from('event_tuples')
        .select('subject_id, verb, object_text, occurred_at')
        .eq('org_id', orgId)
        .gte('occurred_at', fourHoursAgo)
        .order('occurred_at', { ascending: false })
        .limit(10),

      // 3. Pending approvals count
      supabase
        .from('approval_queue')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'pending'),

      // 4. Morning briefing from org settings
      supabase
        .from('organisations')
        .select('settings')
        .eq('id', orgId)
        .single(),
    ])

    // Collect unique entity IDs
    const entityIds = new Set<string>()
    const sections: string[] = []

    // Process deadlines
    if (deadlines.status === 'fulfilled' && deadlines.value.data?.length) {
      const items = deadlines.value.data
      items.forEach((e: { subject_id: string }) => entityIds.add(e.subject_id))
      // Get entity names
      const { data: nodes } = await supabase
        .from('entity_nodes')
        .select('id, name')
        .in('id', items.map((e: { subject_id: string }) => e.subject_id))
      const nameMap = new Map((nodes || []).map((n: { id: string; name: string }) => [n.id, n.name]))
      const lines = items.map((e: { subject_id: string; verb: string; object_text: string | null; occurred_at: string }) => {
        const name = nameMap.get(e.subject_id) || 'Unknown'
        const when = new Date(e.occurred_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        return `${name}: ${e.verb} ${e.object_text || ''} (${when})`
      })
      sections.push('Upcoming:\n' + lines.join('\n'))
    }

    // Process recent activity
    if (recentActivity.status === 'fulfilled' && recentActivity.value.data?.length) {
      const items = recentActivity.value.data
      items.forEach((e: { subject_id: string }) => entityIds.add(e.subject_id))
      const { data: nodes } = await supabase
        .from('entity_nodes')
        .select('id, name')
        .in('id', items.map((e: { subject_id: string }) => e.subject_id))
      const nameMap = new Map((nodes || []).map((n: { id: string; name: string }) => [n.id, n.name]))
      const lines = items.slice(0, 5).map((e: { subject_id: string; verb: string; object_text: string | null }) => {
        const name = nameMap.get(e.subject_id) || 'Unknown'
        return `${name}: ${e.verb} ${e.object_text || ''}`
      })
      sections.push('Recent:\n' + lines.join('\n'))
    }

    // Process pending approvals
    if (pendingApprovals.status === 'fulfilled') {
      const count = pendingApprovals.value.count || 0
      if (count > 0) sections.push(`${count} pending approval${count > 1 ? 's' : ''}`)
    }

    // Process morning briefing urgent items
    if (briefing.status === 'fulfilled' && briefing.value.data?.settings?.morning_briefing) {
      const mb = briefing.value.data.settings.morning_briefing as Record<string, unknown>
      if (Array.isArray(mb.urgent) && mb.urgent.length > 0) {
        const lines = (mb.urgent as Array<{ entity: string; reason: string }>).map(
          (u) => `${u.entity}: ${u.reason}`
        )
        sections.push('Urgent:\n' + lines.join('\n'))
      }
    }

    if (sections.length === 0) return EMPTY

    const text = '## Anticipated Context\n' + sections.join('\n\n')
    const tokenEstimate = Math.ceil(text.length / 3.5)

    return {
      text,
      entityNodeIds: [...entityIds].slice(0, 5),
      tokenEstimate,
    }
  } catch (err) {
    logger.warn('[predictive-loader] Failed:', err instanceof Error ? err.message : String(err))
    return EMPTY
  }
}
