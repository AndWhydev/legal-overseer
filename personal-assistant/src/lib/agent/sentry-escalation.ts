import type { SupabaseClient } from '@supabase/supabase-js'

export interface SentryEscalationResult {
  processed: number
  escalated: number
  failed: number
}

type AcknowledgeError = 'NOT_FOUND' | 'ALREADY_ACKNOWLEDGED'

export type AcknowledgeSentryAlertResult =
  | { ok: true; alertId: string }
  | { ok: false; error: AcknowledgeError }

interface DueAlertRow {
  id: string
  org_id: string
  watch_id: string
  agent_config_id: string | null
  issue_type: string
  severity: string
  issue_summary: string
  evidence: Record<string, unknown>
  remediation_suggestion: string
  escalation_count: number
  watches: { escalation_minutes?: number | null } | Array<{ escalation_minutes?: number | null }> | null
}

interface ExistingAlertRow {
  id: string
  status: string
  acknowledged_at: string | null
}

function resolveEscalationMinutes(row: DueAlertRow): number {
  const watch = Array.isArray(row.watches) ? row.watches[0] : row.watches
  const configured = watch?.escalation_minutes
  if (typeof configured !== 'number' || !Number.isFinite(configured)) {
    return 15
  }
  return Math.max(1, Math.floor(configured))
}

async function createEscalationApproval(
  supabase: SupabaseClient,
  alert: DueAlertRow,
): Promise<{ error: Error | null }> {
  if (!alert.agent_config_id) {
    return { error: new Error('missing_agent_config_id') }
  }

  const payload = {
    alert_id: alert.id,
    watch_id: alert.watch_id,
    issue_type: alert.issue_type,
    severity: alert.severity,
    evidence: alert.evidence,
    remediation_suggestion: alert.remediation_suggestion,
  }

  const { error } = await supabase.from('approval_queue').insert({
    org_id: alert.org_id,
    agent_config_id: alert.agent_config_id,
    agent_run_id: null,
    action_type: 'sentry_escalation',
    action_payload: payload,
    action_summary: `Sentry escalation: ${alert.issue_summary}`,
    confidence_score: 0,
    routing_decision: 'escalate',
    priority: 'urgent',
    digest_eligible: false,
    status: 'pending',
    context_snapshot: {
      source: 'sentry-escalation',
      alertId: alert.id,
      escalationCount: alert.escalation_count,
    },
  })

  return { error: error ? new Error(error.message) : null }
}

export async function processSentryEscalations(
  supabase: SupabaseClient,
  orgId: string,
): Promise<SentryEscalationResult> {
  const now = new Date()
  const nowIso = now.toISOString()

  const { data, error } = await supabase
    .from('sentry_alerts')
    .select(
      'id, org_id, watch_id, agent_config_id, issue_type, severity, issue_summary, evidence, remediation_suggestion, escalation_count, watches!inner(escalation_minutes)',
    )
    .eq('org_id', orgId)
    .in('status', ['pending', 'escalated'])
    .is('acknowledged_at', null)
    .lte('next_escalation_at', nowIso)

  if (error) {
    return { processed: 0, escalated: 0, failed: 1 }
  }

  const dueAlerts = ((data ?? []) as DueAlertRow[]).sort((a, b) => a.id.localeCompare(b.id))

  const result: SentryEscalationResult = {
    processed: dueAlerts.length,
    escalated: 0,
    failed: 0,
  }

  for (const alert of dueAlerts) {
    try {
      const approvalResult = await createEscalationApproval(supabase, alert)
      if (approvalResult.error) {
        result.failed += 1
        continue
      }

      const escalationMinutes = resolveEscalationMinutes(alert)
      const nextEscalationAt = new Date(now.getTime() + escalationMinutes * 60_000).toISOString()

      const { error: updateError } = await supabase
        .from('sentry_alerts')
        .update({
          status: 'escalated',
          escalation_count: alert.escalation_count + 1,
          escalated_at: nowIso,
          next_escalation_at: nextEscalationAt,
        })
        .eq('id', alert.id)
        .eq('org_id', orgId)
        .is('acknowledged_at', null)

      if (updateError) {
        result.failed += 1
        continue
      }

      result.escalated += 1
    } catch {
      result.failed += 1
    }
  }

  return result
}

export async function acknowledgeSentryAlert(
  supabase: SupabaseClient,
  alertId: string,
  userId: string,
): Promise<AcknowledgeSentryAlertResult> {
  const { data: existing, error: existingError } = await supabase
    .from('sentry_alerts')
    .select('id, status, acknowledged_at')
    .eq('id', alertId)
    .single<ExistingAlertRow>()

  if (existingError || !existing) {
    return { ok: false, error: 'NOT_FOUND' }
  }

  if (existing.status === 'acknowledged' || existing.acknowledged_at) {
    return { ok: false, error: 'ALREADY_ACKNOWLEDGED' }
  }

  const { error: updateError } = await supabase
    .from('sentry_alerts')
    .update({
      status: 'acknowledged',
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString(),
      next_escalation_at: null,
    })
    .eq('id', alertId)
    .is('acknowledged_at', null)

  if (updateError) {
    return { ok: false, error: 'NOT_FOUND' }
  }

  return { ok: true, alertId }
}
