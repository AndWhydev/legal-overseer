import type { SupabaseClient } from '@supabase/supabase-js'
import { createApproval, type ApprovalRecord } from './approval-queue'
import { notifyApproval } from './approval-notifier'
import { sendMessage } from '../channels/whatsapp'

const TWO_MINUTES_MS = 2 * 60 * 1000

interface LeadRow {
  id: string
  org_id: string
  source_channel: string
  source_detail: string | null
  status: string
  ack_status: string
  created_at: string
  estimated_value: number | null
  service_interest: string[] | null
  timeline_days: number | null
  metadata: Record<string, unknown> | null
}

interface AgentConfigRow {
  id: string
}

interface ApprovedAckRow {
  id: string
  action_payload: Record<string, unknown>
}

interface LeadAckDeliverySuccess {
  status: 'sent'
  providerMessageId: string
  channel: string
  sentAt: string
  approvalId: string
}

interface LeadAckDeliveryFailure {
  status: 'failed'
  channel: string
  failedAt: string
  reason: string
  approvalId: string
}

export interface QueueLeadAcknowledgmentParams {
  lead: LeadRow
  agentConfigId: string
}

export interface QueueLeadAcknowledgmentResult {
  queued: boolean
  skippedOverdue: boolean
  approvalId: string | null
}

export interface ProcessLeadAcknowledgmentResult {
  queued: number
  sent: number
  escalated: number
  skipped_overdue: number
  failed: number
}

function isWithinSla(createdAt: string, now: Date): boolean {
  const created = new Date(createdAt).getTime()
  if (!Number.isFinite(created)) return false
  return now.getTime() - created < TWO_MINUTES_MS
}

function buildAckDraft(lead: LeadRow): string {
  const services = Array.isArray(lead.service_interest) && lead.service_interest.length > 0
    ? ` around ${lead.service_interest.join(', ')}`
    : ''
  const timeline = typeof lead.timeline_days === 'number' ? ` in the next ${lead.timeline_days} days` : ''
  return `Thanks for reaching out${services}. I can help you scope this${timeline}. If this looks right, I will share next steps and timing.`
}

function readMetadataTimestamp(metadata: Record<string, unknown> | null, key: string): string | null {
  if (!metadata || typeof metadata[key] !== 'string') return null
  return metadata[key] as string
}

async function updateLead(
  supabase: SupabaseClient,
  leadId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('leads').update(patch).eq('id', leadId)
  if (error) throw new Error(error.message)
}

export async function autoApproveLeadAcknowledgment(
  supabase: SupabaseClient,
  params: QueueLeadAcknowledgmentParams,
): Promise<{ sent: boolean; error?: string }> {
  const { lead, agentConfigId } = params

  if (lead.ack_status === 'sent') {
    return { sent: false, error: 'already_sent' }
  }

  const now = new Date()
  if (!isWithinSla(lead.created_at, now)) {
    await updateLead(supabase, lead.id, { ack_status: 'overdue' })
    return { sent: false, error: 'sla_exceeded' }
  }

  const draftBody = buildAckDraft(lead)

  // Create auto-approved approval record (no human needed)
  await createApproval(supabase, {
    org_id: lead.org_id,
    agent_config_id: agentConfigId,
    action_type: 'lead_ack_send',
    action_payload: {
      lead_id: lead.id,
      message_channel: lead.source_channel,
      draft_body: draftBody,
      recipient: lead.source_detail,
    },
    action_summary: `[Auto-approved] Send lead acknowledgment for ${lead.source_detail ?? lead.id}`,
    confidence_score: 1,
    routing_decision: 'ask', // will be overridden by status
    priority: 'normal',
    context_snapshot: {
      source: 'lead-acknowledgment',
      leadId: lead.id,
      autoApproved: true,
    },
  })

  // Immediately attempt delivery
  const deliveryResult = await attemptAckDelivery({
    message_channel: lead.source_channel,
    recipient: lead.source_detail,
    draft_body: draftBody,
  })

  if (deliveryResult.success) {
    await updateLead(supabase, lead.id, {
      ack_status: 'sent',
      metadata: {
        ...(lead.metadata ?? {}),
        autoApproved: true,
        autoApprovedAt: now.toISOString(),
        ackSentAt: now.toISOString(),
        ackDelivery: {
          status: 'sent',
          providerMessageId: deliveryResult.providerMessageId,
          channel: deliveryResult.channel,
          sentAt: now.toISOString(),
        },
      },
    })
    return { sent: true }
  }

  await updateLead(supabase, lead.id, {
    metadata: {
      ...(lead.metadata ?? {}),
      autoApproved: true,
      autoApprovedAt: now.toISOString(),
      ackDelivery: {
        status: 'failed',
        channel: deliveryResult.channel,
        failedAt: now.toISOString(),
        reason: deliveryResult.reason,
      },
    },
  })

  return { sent: false, error: deliveryResult.reason }
}

export async function queueLeadAcknowledgment(
  supabase: SupabaseClient,
  params: QueueLeadAcknowledgmentParams,
): Promise<QueueLeadAcknowledgmentResult> {
  const { lead, agentConfigId } = params
  if (lead.status !== 'qualified') {
    return { queued: false, skippedOverdue: false, approvalId: null }
  }

  if (lead.ack_status === 'draft_queued' || lead.ack_status === 'sent') {
    return { queued: false, skippedOverdue: false, approvalId: null }
  }

  const now = new Date()
  if (!isWithinSla(lead.created_at, now)) {
    await updateLead(supabase, lead.id, { ack_status: 'overdue' })
    return { queued: false, skippedOverdue: true, approvalId: null }
  }

  const approval = await createApproval(supabase, {
    org_id: lead.org_id,
    agent_config_id: agentConfigId,
    action_type: 'lead_ack_send',
    action_payload: {
      lead_id: lead.id,
      message_channel: lead.source_channel,
      draft_body: buildAckDraft(lead),
      recipient: lead.source_detail,
    },
    action_summary: `Send lead acknowledgment draft for ${lead.source_detail ?? lead.id}`,
    confidence_score: 0,
    routing_decision: 'ask',
    priority: 'normal',
    context_snapshot: {
      source: 'lead-acknowledgment',
      leadId: lead.id,
    },
  })

  await updateLead(supabase, lead.id, {
    ack_status: 'draft_queued',
    ack_draft_created_at: now.toISOString(),
  })

  return { queued: true, skippedOverdue: false, approvalId: approval.id }
}

export async function escalateHighValueLead(
  supabase: SupabaseClient,
  lead: LeadRow,
  agentConfigId: string,
): Promise<boolean> {
  if (typeof lead.estimated_value !== 'number' || lead.estimated_value <= 5000) {
    return false
  }

  if (readMetadataTimestamp(lead.metadata, 'highValueEscalatedAt')) {
    return false
  }

  const approval: ApprovalRecord = await createApproval(supabase, {
    org_id: lead.org_id,
    agent_config_id: agentConfigId,
    action_type: 'lead_high_value_escalation',
    action_payload: {
      lead_id: lead.id,
      estimated_value: lead.estimated_value,
      source_channel: lead.source_channel,
      source_detail: lead.source_detail,
    },
    action_summary: `URGENT: High-value lead ${lead.source_detail ?? lead.id} (${lead.estimated_value})`,
    confidence_score: 0,
    routing_decision: 'escalate',
    priority: 'urgent',
    context_snapshot: {
      source: 'lead-acknowledgment',
      leadId: lead.id,
      trigger: 'estimated_value_gt_5000',
    },
  })

  await notifyApproval(supabase, approval)

  await updateLead(supabase, lead.id, {
    metadata: {
      ...(lead.metadata ?? {}),
      highValueEscalatedAt: new Date().toISOString(),
    },
  })

  return true
}

async function resolveAgentConfigId(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('org_id', orgId)
    .eq('agent_type', 'lead-swarm')
    .limit(1)

  if (error) return null
  const row = (data ?? [])[0] as AgentConfigRow | undefined
  return row?.id ?? null
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

type DeliveryAttemptResult =
  | { success: true; channel: string; providerMessageId: string }
  | { success: false; channel: string; reason: string }

async function attemptAckDelivery(
  payload: Record<string, unknown>,
): Promise<DeliveryAttemptResult> {
  const channel = readPayloadString(payload, 'message_channel')?.toLowerCase() ?? 'unknown'
  const recipient = readPayloadString(payload, 'recipient')
  const draftBody = readPayloadString(payload, 'draft_body')

  if (!recipient) {
    return {
      success: false,
      channel,
      reason: 'missing_recipient',
    }
  }

  if (!draftBody) {
    return {
      success: false,
      channel,
      reason: 'missing_draft_body',
    }
  }

  if (channel !== 'whatsapp') {
    return {
      success: false,
      channel,
      reason: `unsupported_channel:${channel}`,
    }
  }

  try {
    const providerMessageId = await sendMessage(recipient, draftBody)
    if (!providerMessageId) {
      return {
        success: false,
        channel,
        reason: 'provider_send_failed',
      }
    }

    return {
      success: true,
      channel,
      providerMessageId,
    }
  } catch {
    return {
      success: false,
      channel,
      reason: 'provider_send_exception',
    }
  }
}

async function processApprovedAck(
  supabase: SupabaseClient,
  orgId: string,
  approval: ApprovedAckRow,
): Promise<'sent' | 'failed' | 'ignored'> {
  const leadId = readPayloadString(approval.action_payload, 'lead_id')
  if (!leadId) {
    return 'failed'
  }

  const { data: leadData, error: leadError } = await supabase
    .from('leads')
    .select('id, org_id, ack_status, metadata')
    .eq('id', leadId)
    .eq('org_id', orgId)
    .single<LeadRow>()

  if (leadError || !leadData) {
    return 'failed'
  }

  if (leadData.ack_status === 'sent') {
    return 'ignored'
  }

  const deliveryResult = await attemptAckDelivery(approval.action_payload)
  if (deliveryResult.success) {
    const ackDelivery: LeadAckDeliverySuccess = {
      status: 'sent',
      providerMessageId: deliveryResult.providerMessageId,
      channel: deliveryResult.channel,
      sentAt: new Date().toISOString(),
      approvalId: approval.id,
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update({
        ack_status: 'sent',
        metadata: {
          ...(leadData.metadata ?? {}),
          ackSentAt: ackDelivery.sentAt,
          ackDelivery,
        },
      })
      .eq('id', leadId)
      .eq('org_id', orgId)

    if (updateError) {
      return 'failed'
    }

    return 'sent'
  }

  const ackDelivery: LeadAckDeliveryFailure = {
    status: 'failed',
    channel: deliveryResult.channel,
    failedAt: new Date().toISOString(),
    reason: deliveryResult.reason,
    approvalId: approval.id,
  }

  const { error: updateError } = await supabase
    .from('leads')
    .update({
      metadata: {
        ...(leadData.metadata ?? {}),
        ackDelivery,
      },
    })
    .eq('id', leadData.id)
    .eq('org_id', orgId)

  if (updateError) {
    return 'failed'
  }

  return 'failed'
}

export async function processPendingLeadAcks(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ProcessLeadAcknowledgmentResult> {
  const result: ProcessLeadAcknowledgmentResult = {
    queued: 0,
    sent: 0,
    escalated: 0,
    skipped_overdue: 0,
    failed: 0,
  }

  const agentConfigId = await resolveAgentConfigId(supabase, orgId)
  if (!agentConfigId) {
    return { ...result, failed: 1 }
  }

  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id, org_id, source_channel, source_detail, status, ack_status, created_at, estimated_value, service_interest, timeline_days, metadata')
    .eq('org_id', orgId)
    .eq('status', 'qualified')
    .in('ack_status', ['pending', 'draft_queued'])

  if (leadsError) {
    return { ...result, failed: 1 }
  }

  for (const row of (leads ?? []) as LeadRow[]) {
    try {
      if (row.ack_status === 'pending') {
        const queueResult = await queueLeadAcknowledgment(supabase, {
          lead: row,
          agentConfigId,
        })
        if (queueResult.queued) result.queued += 1
        if (queueResult.skippedOverdue) result.skipped_overdue += 1
      }

      const escalated = await escalateHighValueLead(supabase, row, agentConfigId)
      if (escalated) result.escalated += 1
    } catch {
      result.failed += 1
    }
  }

  const { data: approvals, error: approvalsError } = await supabase
    .from('approval_queue')
    .select('id, action_payload')
    .eq('org_id', orgId)
    .eq('action_type', 'lead_ack_send')
    .eq('status', 'approved')

  if (approvalsError) {
    result.failed += 1
    return result
  }

  for (const approval of (approvals ?? []) as ApprovedAckRow[]) {
    const outcome = await processApprovedAck(supabase, orgId, approval)
    if (outcome === 'sent') {
      result.sent += 1
      continue
    }

    if (outcome === 'failed') {
      result.failed += 1
    }
  }

  return result
}
