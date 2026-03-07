import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalRecord } from './approval-queue'
import { getDigestApprovals } from './approval-queue'
import { sendApprovalRequest, sendDigest } from '../channels/whatsapp'
import { sendApprovalEmail, sendDigestEmail } from '../email/email-transport'
import { logger } from '@/lib/core/logger';

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
    if (andyPhone) {
      const messageId = await sendApprovalRequest(
        andyPhone,
        approval.id,
        approval.action_summary,
        approval.agent_name ?? approval.agent_configs?.name ?? 'Agent',
        approval.confidence_score,
      )

      if (messageId) {
        return true
      }
    }

    // Fallback to email if WhatsApp is not configured or failed
    const emailSent = await sendApprovalEmail(
      approval.id,
      approval.action_summary,
      approval.agent_name ?? approval.agent_configs?.name ?? 'Agent',
      approval.confidence_score,
    )

    return emailSent
  } catch (error) {
    logger.warn('notifyApproval failed', error)
    // Attempt email fallback on error
    try {
      return await sendApprovalEmail(
        approval.id,
        approval.action_summary,
        approval.agent_name ?? approval.agent_configs?.name ?? 'Agent',
        approval.confidence_score,
      )
    } catch {
      return false
    }
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

    const digestItems = approvals.map((approval) => ({
      id: approval.id,
      summary: approval.action_summary,
      agentName: approval.agent_name ?? approval.agent_configs?.name ?? 'Agent',
    }))

    const andyPhone = process.env.WHATSAPP_ANDY_PHONE
    if (andyPhone) {
      const messageId = await sendDigest(andyPhone, digestItems)

      if (messageId) {
        return approvals.length
      }
    }

    // Fallback to email if WhatsApp is not configured or failed
    const emailSent = await sendDigestEmail(digestItems)

    return emailSent ? approvals.length : 0
  } catch (error) {
    logger.warn('sendDailyDigest failed', error)
    // Attempt email fallback on error
    try {
      const approvals = await getDigestApprovals(supabase, orgId)
      if (approvals.length === 0) {
        return 0
      }

      const emailSent = await sendDigestEmail(
        approvals.map((approval) => ({
          id: approval.id,
          summary: approval.action_summary,
          agentName: approval.agent_name ?? approval.agent_configs?.name ?? 'Agent',
        })),
      )

      return emailSent ? approvals.length : 0
    } catch {
      return 0
    }
  }
}
