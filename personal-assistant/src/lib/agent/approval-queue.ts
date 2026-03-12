import type { SupabaseClient } from '@supabase/supabase-js'
import { routeAgentAction } from './confidence-router'
import { dispatchNotification } from '../notifications/dispatcher'
import { notifyApproval } from './approval-notifier'
import { recordActionOutcome } from '@/lib/intelligence/confidence-calibrator'
import { logger } from '@/lib/core/logger';

type ApprovalPriority = 'urgent' | 'normal' | 'low'
type ApprovalStatus = 'pending' | 'approved' | 'executing' | 'completed' | 'rejected' | 'failed' | 'expired' | 'auto_expired'
type ApprovalRoutingDecision = 'ask' | 'escalate'

export interface ApprovalRecord {
  id: string
  org_id: string
  agent_config_id: string
  agent_run_id: string | null
  action_type: string
  action_payload: Record<string, unknown>
  action_summary: string
  confidence_score: number
  routing_decision: ApprovalRoutingDecision
  priority: ApprovalPriority
  digest_eligible: boolean
  status: ApprovalStatus
  context_snapshot: Record<string, unknown>
  resolved_by: string | null
  resolved_at: string | null
  resolved_via: 'dashboard' | 'whatsapp' | 'chat' | 'auto_expire' | null
  expires_at: string
  created_at: string
  execution_started_at?: string | null
  execution_completed_at?: string | null
  execution_result?: Record<string, unknown> | null
  execution_error?: string | null
  retry_count?: number | null
  agent_configs?: { name: string | null } | null
  agent_name?: string | null
}

export interface CreateApprovalParams {
  org_id: string
  agent_config_id: string
  agent_run_id?: string | null
  action_type: string
  action_payload?: Record<string, unknown>
  action_summary: string
  confidence_score: number
  routing_decision: ApprovalRoutingDecision
  priority?: ApprovalPriority
  context_snapshot?: Record<string, unknown>
}

export interface QueueAgentActionParams {
  org_id: string
  agent_config_id: string
  agent_run_id?: string | null
  action_type: string
  action_payload?: Record<string, unknown>
  action_summary: string
  confidence_score: number
  priority?: ApprovalPriority
  context_snapshot?: Record<string, unknown>
  agentConfig?: { confidence_thresholds?: { act?: number; ask?: number } }
  orgSettings?: { confidence_thresholds?: { act?: number; ask?: number } }
}

function normalizeApprovalRow(row: ApprovalRecord): ApprovalRecord {
  return {
    ...row,
    agent_name: row.agent_configs?.name ?? null,
  }
}

const PRIORITY_RANK: Record<ApprovalPriority, number> = {
  urgent: 0,
  normal: 1,
  low: 2,
}

export async function createApproval(
  supabase: SupabaseClient,
  params: CreateApprovalParams,
): Promise<ApprovalRecord> {
  const priority = params.priority ?? 'normal'
  const digestEligible = priority === 'low'

  const { data, error } = await supabase
    .from('approval_queue')
    .insert({
      org_id: params.org_id,
      agent_config_id: params.agent_config_id,
      agent_run_id: params.agent_run_id ?? null,
      action_type: params.action_type,
      action_payload: params.action_payload ?? {},
      action_summary: params.action_summary,
      confidence_score: params.confidence_score,
      routing_decision: params.routing_decision,
      priority,
      digest_eligible: digestEligible,
      context_snapshot: params.context_snapshot ?? {},
    })
    .select('*, agent_configs(name)')
    .single<ApprovalRecord>()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create approval')
  }

  const record = normalizeApprovalRow(data)

  // Dispatch notification for new approval
  const urgency = priority === 'urgent' ? 'high' as const : 'normal' as const
  dispatchNotification(supabase, {
    orgId: params.org_id,
    type: 'approval_needed',
    title: `Approval Needed: ${params.action_summary}`,
    body: `Agent action requires approval (${(params.confidence_score * 100).toFixed(0)}% confidence)`,
    urgency,
    metadata: {
      approvalId: record.id,
      summary: params.action_summary,
      agentName: record.agent_name ?? 'Agent',
      confidence: params.confidence_score,
      actionType: params.action_type,
    },
  }).catch(err => {
    logger.warn('[approval-queue] Notification dispatch failed:', err)
  })

  // Trigger notifyApproval for WhatsApp/email notifications
  notifyApproval(supabase, record).catch(err => {
    logger.warn('[approval-queue] notifyApproval failed:', err)
  })

  return record
}

export async function resolveApproval(
  supabase: SupabaseClient,
  approvalId: string,
  decision: 'approved' | 'rejected',
  resolvedBy: string,
  resolvedVia: 'dashboard' | 'whatsapp' | 'chat',
): Promise<ApprovalRecord> {
  const { data: existing, error: existingError } = await supabase
    .from('approval_queue')
    .select('id, status, org_id, action_type, confidence_score, agent_config_id')
    .eq('id', approvalId)
    .single<{
      id: string
      status: ApprovalStatus
      org_id: string
      action_type: string
      confidence_score: number
      agent_config_id: string
    }>()

  if (existingError || !existing) {
    throw new Error('APPROVAL_NOT_FOUND')
  }

  if (existing.status !== 'pending') {
    throw new Error('APPROVAL_ALREADY_RESOLVED')
  }

  const { data, error } = await supabase
    .from('approval_queue')
    .update({
      status: decision,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      resolved_via: resolvedVia,
    })
    .eq('id', approvalId)
    .select('*, agent_configs(name)')
    .single<ApprovalRecord>()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to resolve approval')
  }

  // Record outcome for confidence calibration (fire-and-forget)
  // Look up agent_type from agent_configs to log the outcome
  ;(async () => {
    try {
      const { data: config } = await supabase
        .from('agent_configs')
        .select('agent_type')
        .eq('id', existing.agent_config_id)
        .single()

      if (config?.agent_type) {
        await recordActionOutcome(
          supabase,
          existing.org_id,
          config.agent_type,
          existing.action_type,
          existing.confidence_score,
          decision === 'approved',
          null, // wasCorrect: unknown at resolution time
        )
      }
    } catch (err) {
      logger.warn('[approval-queue] Failed to record action outcome:', err)
    }
  })()

  const record = normalizeApprovalRow(data)

  // Fire-and-forget execution for approved actions.
  // The executeApprovedAction has an atomic idempotency guard, so concurrent
  // callers (e.g. approve_action tool also calling it) won't double-execute.
  if (decision === 'approved') {
    import('./action-executor').then(({ executeApprovedAction }) => {
      executeApprovedAction(supabase, record).catch(err => {
        logger.warn('[approval-queue] Fire-and-forget execution failed:', err)
      })
    }).catch(err => {
      logger.warn('[approval-queue] Failed to import action-executor:', err)
    })
  }

  return record
}

export async function getPendingApprovals(
  supabase: SupabaseClient,
  orgId: string,
  opts?: { limit?: number; offset?: number; priorityFilter?: ApprovalPriority },
): Promise<ApprovalRecord[]> {
  const limit = opts?.limit ?? 20
  const offset = opts?.offset ?? 0

  let query = supabase
    .from('approval_queue')
    .select('*, agent_configs(name)')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .range(offset, offset + Math.max(limit - 1, 0))

  if (opts?.priorityFilter) {
    query = query.eq('priority', opts.priorityFilter)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? [])
    .map((row) => normalizeApprovalRow(row as ApprovalRecord))
    .sort((a, b) => {
      const priorityDelta = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (priorityDelta !== 0) return priorityDelta
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
}

export async function getDigestApprovals(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ApprovalRecord[]> {
  const { data, error } = await supabase
    .from('approval_queue')
    .select('*, agent_configs(name)')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .eq('digest_eligible', true)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => normalizeApprovalRow(row as ApprovalRecord))
}

export async function expireStaleApprovals(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('approval_queue')
    .update({
      status: 'auto_expired',
      resolved_at: new Date().toISOString(),
      resolved_via: 'auto_expire',
    })
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select('id')

  if (error) {
    throw new Error(error.message)
  }

  return data?.length ?? 0
}

export async function queueAgentAction(
  supabase: SupabaseClient,
  params: QueueAgentActionParams,
): Promise<ApprovalRecord | null> {
  const routing = routeAgentAction(params.confidence_score, params.agentConfig, params.orgSettings)
  if (routing.decision === 'act') {
    return null
  }

  return createApproval(supabase, {
    org_id: params.org_id,
    agent_config_id: params.agent_config_id,
    agent_run_id: params.agent_run_id,
    action_type: params.action_type,
    action_payload: params.action_payload,
    action_summary: params.action_summary,
    confidence_score: params.confidence_score,
    routing_decision: routing.decision,
    priority: params.priority,
    context_snapshot: params.context_snapshot,
  })
}
