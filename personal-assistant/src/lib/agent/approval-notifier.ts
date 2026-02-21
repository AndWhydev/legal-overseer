import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalRecord } from './approval-queue'
import { getDigestApprovals } from './approval-queue'
import { sendApprovalRequest, sendDigest } from '../channels/whatsapp'

export async function notifyApproval(
  _supabase: SupabaseClient,
  approval: ApprovalRecord,
): Promise<boolean> {
  try {
    const shouldSendSingle =
      approval.routing_decision === 'escalate' ||
      (approval.routing_decision === 'ask' &&
        (approval.priority === 'urgent' || approval.priority === 'normal'))

    if (!shouldSendSingle) {
      return false
    }

    const andyPhone = process.env.WHATSAPP_ANDY_PHONE
    if (!andyPhone) {
      console.warn('notifyApproval skipped: missing WHATSAPP_ANDY_PHONE')
      return false
    }

    const messageId = await sendApprovalRequest(
      andyPhone,
      approval.id,
      approval.action_summary,
      approval.agent_name ?? approval.agent_configs?.name ?? 'Agent',
      approval.confidence_score,
    )

    return Boolean(messageId)
  } catch (error) {
    console.warn('notifyApproval failed', error)
    return false
  }
}

export async function sendDailyDigest(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  try {
    const approvals = await getDigestApprovals(supabase, orgId)
    if (approvals.length === 0) {
      return 0
    }

    const andyPhone = process.env.WHATSAPP_ANDY_PHONE
    if (!andyPhone) {
      console.warn('sendDailyDigest skipped: missing WHATSAPP_ANDY_PHONE')
      return 0
    }

    const messageId = await sendDigest(
      andyPhone,
      approvals.map((approval) => ({
        id: approval.id,
        summary: approval.action_summary,
        agentName: approval.agent_name ?? approval.agent_configs?.name ?? 'Agent',
      })),
    )

    return messageId ? approvals.length : 0
  } catch (error) {
    console.warn('sendDailyDigest failed', error)
    return 0
  }
}
