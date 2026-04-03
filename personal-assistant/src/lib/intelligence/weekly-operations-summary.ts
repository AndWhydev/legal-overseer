/**
 * Weekly Operations Summary — Level 5 Autonomous Operations Digest
 *
 * Generates a comprehensive summary of what BitBit handled over the past 7 days:
 * - Autonomous vs. approval-required actions
 * - Project phase progress
 * - Financial activity (invoices sent/paid)
 * - Relationship health changes
 * - Confidence calibration progress
 * - Standing order activity
 *
 * Designed to be the summary a user reviews weekly at Level 5,
 * replacing the need to check in daily.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

export interface WeeklyOperationsSummary {
  period: { start: string; end: string }
  autonomy: {
    totalRuns: number
    actDecisions: number
    askDecisions: number
    escalateDecisions: number
    autonomyRate: number
    avgConfidence: number
    outcomesRecorded: number
  }
  projects: Array<{
    id: string
    name: string
    status: string
    phasesCompleted: string[]
    phasesStarted: string[]
    blockers: string[]
    nextAction: string | null
  }>
  financial: {
    invoicesSent: number
    invoicesPaid: number
    totalInvoiced: number
    totalReceived: number
    overdue: number
  }
  communications: {
    messagesProcessed: number
    emailsSent: number
    approvalsPending: number
    approvalsResolved: number
  }
  standingOrders: {
    active: number
    created: number
    triggered: number
  }
  highlights: string[]
  concerns: string[]
}

/**
 * Generate a weekly operations summary for an org.
 */
export async function generateWeeklyOperationsSummary(
  supabase: SupabaseClient,
  orgId: string,
): Promise<WeeklyOperationsSummary> {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const weekAgoISO = weekAgo.toISOString()

  const [
    agentRuns,
    actionOutcomes,
    projects,
    invoices,
    channelMessages,
    approvals,
    standingOrders,
  ] = await Promise.all([
    fetchAgentRuns(supabase, orgId, weekAgoISO),
    fetchActionOutcomes(supabase, orgId, weekAgoISO),
    fetchProjects(supabase, orgId),
    fetchInvoiceActivity(supabase, orgId, weekAgoISO),
    fetchChannelActivity(supabase, orgId, weekAgoISO),
    fetchApprovalActivity(supabase, orgId, weekAgoISO),
    fetchStandingOrders(supabase, orgId, weekAgoISO),
  ])

  const actCount = agentRuns.filter(r => r.routing_decision === 'act').length
  const askCount = agentRuns.filter(r => r.routing_decision === 'ask').length
  const escalateCount = agentRuns.filter(r => r.routing_decision === 'escalate').length
  const avgConfidence = agentRuns.length > 0
    ? agentRuns.reduce((sum, r) => sum + (r.confidence_score || 0), 0) / agentRuns.length
    : 0

  const highlights: string[] = []
  const concerns: string[] = []

  if (actCount > 0) highlights.push(`${actCount} actions executed autonomously`)
  if (invoices.paid > 0) highlights.push(`${invoices.paid} invoices paid ($${invoices.totalReceived.toFixed(0)})`)
  if (projects.some(p => p.phasesCompleted.length > 0)) {
    highlights.push('Project phases completed: ' + projects.flatMap(p => p.phasesCompleted).join(', '))
  }

  if (invoices.overdue > 0) concerns.push(`${invoices.overdue} overdue invoices`)
  if (projects.some(p => p.blockers.length > 0)) {
    concerns.push('Blocked projects: ' + projects.filter(p => p.blockers.length > 0).map(p => p.name).join(', '))
  }
  if (escalateCount > agentRuns.length * 0.5) {
    concerns.push('High escalation rate — confidence thresholds may need adjustment')
  }

  return {
    period: { start: weekAgoISO, end: now.toISOString() },
    autonomy: {
      totalRuns: agentRuns.length,
      actDecisions: actCount,
      askDecisions: askCount,
      escalateDecisions: escalateCount,
      autonomyRate: agentRuns.length > 0 ? Math.round((actCount / agentRuns.length) * 100) : 0,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      outcomesRecorded: actionOutcomes,
    },
    projects,
    financial: invoices,
    communications: {
      messagesProcessed: channelMessages,
      emailsSent: 0,
      approvalsPending: approvals.pending,
      approvalsResolved: approvals.resolved,
    },
    standingOrders,
    highlights,
    concerns,
  }
}

// --- Data fetchers ---

async function fetchAgentRuns(supabase: SupabaseClient, orgId: string, since: string) {
  const { data } = await supabase
    .from('agent_runs')
    .select('confidence_score, routing_decision, tool_calls, status')
    .eq('org_id', orgId)
    .gte('created_at', since)
  return data ?? []
}

async function fetchActionOutcomes(supabase: SupabaseClient, orgId: string, since: string) {
  const { count } = await supabase
    .from('action_outcomes')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', since)
  return count ?? 0
}

async function fetchProjects(supabase: SupabaseClient, orgId: string) {
  const { data } = await supabase
    .from('projects')
    .select('id, name, status, metadata')
    .eq('org_id', orgId)
    .in('status', ['active', 'blocked', 'completed'])
  return (data ?? []).map(p => {
    const meta = (p.metadata ?? {}) as Record<string, unknown>
    const phases = Array.isArray(meta.phases) ? meta.phases as Record<string, unknown>[] : []
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      phasesCompleted: phases.filter(ph => ph.status === 'complete').map(ph => ph.title as string),
      phasesStarted: phases.filter(ph => ph.status === 'active').map(ph => ph.title as string),
      blockers: (Array.isArray(meta.blockers) ? meta.blockers : []).map((b: Record<string, unknown>) => b.description as string),
      nextAction: (meta.next_action as string) || null,
    }
  })
}

async function fetchInvoiceActivity(supabase: SupabaseClient, orgId: string, since: string) {
  const { data: sent } = await supabase
    .from('invoices')
    .select('total, status')
    .eq('org_id', orgId)
    .gte('created_at', since)
  const { data: paid } = await supabase
    .from('invoices')
    .select('total')
    .eq('org_id', orgId)
    .eq('status', 'paid')
    .gte('paid_date', since)
  const { count: overdue } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'overdue')
  return {
    invoicesSent: (sent ?? []).length,
    invoicesPaid: (paid ?? []).length,
    totalInvoiced: (sent ?? []).reduce((s, i) => s + (i.total || 0), 0),
    totalReceived: (paid ?? []).reduce((s, i) => s + (i.total || 0), 0),
    overdue: overdue ?? 0,
  }
}

async function fetchChannelActivity(supabase: SupabaseClient, orgId: string, since: string) {
  const { count } = await supabase
    .from('channel_messages')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', since)
  return count ?? 0
}

async function fetchApprovalActivity(supabase: SupabaseClient, orgId: string, since: string) {
  const { data } = await supabase
    .from('approval_queue')
    .select('status')
    .eq('org_id', orgId)
    .gte('created_at', since)
  const rows = data ?? []
  return {
    pending: rows.filter(r => r.status === 'pending').length,
    resolved: rows.filter(r => ['approved', 'rejected', 'completed'].includes(r.status)).length,
  }
}

async function fetchStandingOrders(supabase: SupabaseClient, orgId: string, since: string) {
  const { count: active } = await supabase
    .from('standing_orders')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('is_active', true)
  const { count: created } = await supabase
    .from('standing_orders')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', since)
  return { active: active ?? 0, created: created ?? 0, triggered: 0 }
}
