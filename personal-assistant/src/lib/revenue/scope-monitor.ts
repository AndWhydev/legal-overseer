/**
 * Scope Creep Monitor
 *
 * Tracks project deliverable count vs original scope.
 * Flags projects where deliverable delta exceeds threshold (default 20%).
 * Generates change-order recommendations with itemized extra work.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { ScopeTracking, RevenueInsight } from './types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScopeCreepAlert {
  project_reference: string
  contact_id: string | null
  contact_name?: string
  original_deliverables: number
  current_deliverables: number
  delta: number
  creep_pct: number
  extra_tasks: Array<{
    title: string
    added_at: string
  }>
  suggested_change_order_cents: number
  confidence: number
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

/**
 * Detect scope creep across active projects.
 *
 * Logic:
 * 1. Get all active scope_tracking records
 * 2. Cross-reference with current task counts per project
 * 3. Flag any project where actual deliverables exceed original by > threshold
 */
export async function detectScopeCreep(
  supabase: SupabaseClient,
  orgId: string,
  options: {
    creepThresholdPct?: number
    defaultTaskValueCents?: number
  } = {},
): Promise<ScopeCreepAlert[]> {
  const {
    creepThresholdPct = 20,
    defaultTaskValueCents = 30000, // $300 per extra task/deliverable
  } = options

  try {
    // Get active scope tracking records
    const { data: scopeRecords, error: scopeError } = await supabase
      .from('scope_tracking')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'active')

    if (scopeError) {
      logger.error('[scope-monitor] Failed to fetch scope records', { error: scopeError.message })
      return []
    }

    if (!scopeRecords || scopeRecords.length === 0) return []

    const alerts: ScopeCreepAlert[] = []

    // Get contact names
    const contactIds = scopeRecords
      .map(s => s.contact_id)
      .filter((id): id is string => id !== null)

    const contacts = new Map<string, string>()
    if (contactIds.length > 0) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('id, name')
        .in('id', contactIds)

      for (const c of contactData ?? []) {
        contacts.set(c.id, c.name)
      }
    }

    for (const scope of scopeRecords as ScopeTracking[]) {
      const creepPct = scope.original_deliverables > 0
        ? ((scope.current_deliverables - scope.original_deliverables) / scope.original_deliverables) * 100
        : 0

      if (creepPct < creepThresholdPct) continue

      const delta = scope.current_deliverables - scope.original_deliverables
      const suggestedCents = delta * defaultTaskValueCents

      alerts.push({
        project_reference: scope.project_reference,
        contact_id: scope.contact_id,
        contact_name: scope.contact_id ? contacts.get(scope.contact_id) : undefined,
        original_deliverables: scope.original_deliverables,
        current_deliverables: scope.current_deliverables,
        delta,
        creep_pct: Math.round(creepPct * 10) / 10,
        extra_tasks: [], // Populated by task lookup below
        suggested_change_order_cents: suggestedCents,
        confidence: Math.min(0.9, 0.6 + (creepPct / 100) * 0.3),
      })
    }

    alerts.sort((a, b) => b.suggested_change_order_cents - a.suggested_change_order_cents)

    logger.info('[scope-monitor] Detection complete', {
      orgId,
      alerts: alerts.length,
    })

    return alerts
  } catch (err) {
    logger.error('[scope-monitor] Detection failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Update scope tracking record from current task counts.
 */
export async function updateScopeFromTasks(
  supabase: SupabaseClient,
  orgId: string,
  projectReference: string,
): Promise<boolean> {
  try {
    // Count tasks for this project
    const { count, error } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .ilike('title', `%${projectReference}%`)

    if (error) {
      logger.warn('[scope-monitor] Failed to count tasks', { error: error.message })
      return false
    }

    const { error: updateError } = await supabase
      .from('scope_tracking')
      .update({
        current_deliverables: count ?? 0,
        last_reviewed_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('project_reference', projectReference)

    if (updateError) {
      logger.warn('[scope-monitor] Failed to update scope', { error: updateError.message })
      return false
    }

    return true
  } catch (err) {
    logger.error('[scope-monitor] Update failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/**
 * Save scope creep alerts as revenue insights.
 */
export async function saveScopeCreepInsights(
  supabase: SupabaseClient,
  orgId: string,
  alerts: ScopeCreepAlert[],
): Promise<number> {
  if (alerts.length === 0) return 0

  // Expire old scope creep insights
  await supabase
    .from('revenue_insights')
    .update({ status: 'expired' })
    .eq('org_id', orgId)
    .eq('insight_type', 'scope_creep')
    .eq('status', 'active')

  const insights: Array<Omit<RevenueInsight, 'id' | 'created_at' | 'updated_at'>> = alerts.map(a => ({
    org_id: orgId,
    insight_type: 'scope_creep' as const,
    severity: a.creep_pct >= 50 ? 'high' as const :
              a.creep_pct >= 30 ? 'medium' as const : 'low' as const,
    status: 'active' as const,
    title: `Scope creep on ${a.project_reference} (+${a.delta} deliverables)`,
    description: `Project has ${a.current_deliverables} deliverables vs original ${a.original_deliverables} (${a.creep_pct}% over scope). ${a.contact_name ? `Client: ${a.contact_name}.` : ''}`,
    recommended_action: `Send change order for $${(a.suggested_change_order_cents / 100).toFixed(2)} covering ${a.delta} additional deliverable(s).`,
    amount_cents: a.suggested_change_order_cents,
    confidence: a.confidence,
    evidence: {
      original_deliverables: a.original_deliverables,
      current_deliverables: a.current_deliverables,
      creep_pct: a.creep_pct,
      extra_tasks: a.extra_tasks,
    },
    contact_id: a.contact_id,
    project_reference: a.project_reference,
    invoice_id: null,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    actioned_at: null,
    actioned_by: null,
  }))

  const { error } = await supabase
    .from('revenue_insights')
    .insert(insights)

  if (error) {
    logger.error('[scope-monitor] Failed to save insights', { error: error.message })
    return 0
  }

  return insights.length
}

/**
 * Initialize scope tracking for a project.
 */
export async function initializeScope(
  supabase: SupabaseClient,
  orgId: string,
  input: {
    projectReference: string
    contactId?: string
    originalDeliverables: number
    originalHoursEstimate?: number
    originalValueCents?: number
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('scope_tracking')
    .upsert({
      org_id: orgId,
      project_reference: input.projectReference,
      contact_id: input.contactId ?? null,
      original_deliverables: input.originalDeliverables,
      original_hours_estimate: input.originalHoursEstimate ?? 0,
      original_value_cents: input.originalValueCents ?? 0,
      current_deliverables: input.originalDeliverables,
      current_hours_logged: 0,
      current_value_cents: 0,
      status: 'active',
    }, { onConflict: 'org_id,project_reference' })
    .select('id')
    .single()

  if (error) {
    logger.error('[scope-monitor] Failed to initialize scope', { error: error.message })
    return null
  }

  return data?.id ?? null
}
