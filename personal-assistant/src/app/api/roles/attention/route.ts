import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { logger } from '@/lib/core/logger'

/**
 * GET /api/roles/attention
 * Returns all items needing user attention across all roles:
 * - Pending approvals from approval_queue
 * - Role escalations from role_activity
 * - High-priority insights from role_activity
 *
 * Combined and sorted by priority then recency.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let orgId: string
    try {
      orgId = await getActiveOrgId(supabase, user.id)
    } catch (tenancyError) {
      const msg = tenancyError instanceof Error ? tenancyError.message : 'Unknown tenancy error'
      logger.warn(`[api/roles/attention] Tenancy resolution failed for user ${user.id}: ${msg}`)
      return NextResponse.json({ error: 'No active organization' }, { status: 403 })
    }
    // 1. Pending approvals
    const { data: approvals } = await supabase
      .from('approval_queue')
      .select('id, action_type, summary, priority, context, created_at, role_config_id')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50)

    // 2. Role escalations (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: escalations } = await supabase
      .from('role_activity')
      .select('id, role_config_id, activity_type, summary, details, confidence, created_at, role_configs!inner(role_type)')
      .eq('org_id', orgId)
      .eq('activity_type', 'escalation')
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(30)

    // 3. High-priority insights (last 48h, action/insight types with high confidence details)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data: highPriority } = await supabase
      .from('role_activity')
      .select('id, role_config_id, activity_type, summary, details, confidence, created_at, role_configs!inner(role_type)')
      .eq('org_id', orgId)
      .in('activity_type', ['insight', 'action'])
      .gte('created_at', twoDaysAgo)
      .order('created_at', { ascending: false })
      .limit(30)

    // Build unified items
    const items: AttentionItem[] = []

    // Map approvals
    for (const a of approvals ?? []) {
      items.push({
        id: `approval-${a.id}`,
        source: 'approval',
        source_id: a.id,
        role_type: null, // approval_queue doesn't always have role_config_id joined to role_type
        priority: mapPriority(a.priority),
        summary: a.summary ?? a.action_type ?? 'Pending approval',
        details: a.context ?? {},
        action_type: a.action_type,
        created_at: a.created_at,
      })
    }

    // Map escalations
    for (const e of escalations ?? []) {
      items.push({
        id: `escalation-${e.id}`,
        source: 'escalation',
        source_id: e.id,
        role_type: (e.role_configs as any)?.role_type ?? null,
        priority: 1, // escalations are always high priority
        summary: e.summary,
        details: e.details ?? {},
        action_type: 'escalation',
        created_at: e.created_at,
      })
    }

    // Map high-priority insights (only include those with priority details or high confidence)
    for (const hp of highPriority ?? []) {
      const detailPriority = (hp.details as any)?.priority
      if (detailPriority === 'high' || detailPriority === 'urgent' || (hp.confidence && hp.confidence >= 0.85)) {
        items.push({
          id: `insight-${hp.id}`,
          source: 'insight',
          source_id: hp.id,
          role_type: (hp.role_configs as any)?.role_type ?? null,
          priority: detailPriority === 'urgent' ? 0 : 2,
          summary: hp.summary,
          details: hp.details ?? {},
          action_type: hp.activity_type,
          created_at: hp.created_at,
        })
      }
    }

    // Sort: priority ASC (0=urgent, 1=high, 2=medium), then created_at DESC
    items.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    // Deduplicate by source_id
    const seen = new Set<string>()
    const deduped = items.filter(item => {
      if (seen.has(item.source_id)) return false
      seen.add(item.source_id)
      return true
    })

    return NextResponse.json({
      items: deduped,
      counts: {
        approvals: (approvals ?? []).length,
        escalations: (escalations ?? []).length,
        total: deduped.length,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch attention items'
    logger.error(`[api/roles/attention] ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface AttentionItem {
  id: string
  source: 'approval' | 'escalation' | 'insight'
  source_id: string
  role_type: string | null
  priority: number // 0=urgent, 1=high, 2=medium, 3=low
  summary: string
  details: Record<string, unknown>
  action_type: string | null
  created_at: string
}

function mapPriority(p: string | null | undefined): number {
  switch (p) {
    case 'urgent': return 0
    case 'high': return 1
    case 'normal': return 2
    case 'low': return 3
    default: return 2
  }
}
