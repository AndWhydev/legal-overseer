import type { SupabaseClient } from '@supabase/supabase-js'
import type { Whisper } from '../types'

export async function whisperAnomalies(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Whisper[]> {
  const whispers: Whisper[] = []

  // Check for recent sentry alerts that are unacknowledged
  const { data: alerts } = await supabase
    .from('sentry_alerts')
    .select('id, issue_summary, severity, created_at')
    .eq('org_id', orgId)
    .in('status', ['pending', 'escalated'])
    .is('acknowledged_at', null)
    .order('created_at', { ascending: false })
    .limit(2)

  if (alerts?.length) {
    for (const alert of alerts) {
      const severityScore = alert.severity === 'critical' ? 0.95 : alert.severity === 'high' ? 0.8 : 0.5

      whispers.push({
        text: alert.issue_summary,
        score: severityScore,
        source: 'anomalies',
        context: {
          alertId: alert.id,
          severity: alert.severity,
          issueSummary: alert.issue_summary,
        },
      })
    }
  }

  // Check for pending approvals
  const { data: approvals } = await supabase
    .from('approval_queue')
    .select('id, action_summary, priority, created_at')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(2)

  if (approvals?.length) {
    for (const approval of approvals) {
      const priorityScore = approval.priority === 'urgent' ? 0.85 : 0.55

      whispers.push({
        text: approval.action_summary,
        score: priorityScore,
        source: 'anomalies',
        context: {
          approvalId: approval.id,
          actionSummary: approval.action_summary,
          priority: approval.priority,
        },
      })
    }
  }

  return whispers
}
