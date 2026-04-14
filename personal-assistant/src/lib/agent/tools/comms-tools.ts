import Anthropic from '@anthropic-ai/sdk'
import type { AgentToolHandler } from '../tools'
import { createApproval, resolveApproval, getPendingApprovals } from '../approval-queue'
import type { ApprovalRecord } from '../approval-queue'
import { executeApprovedAction, requeueExpiredAction } from '../action-executor'
import { checkSendLimit } from '../send-limits'
import { getDefaultAgentConfigId } from '../agent-config'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic tool_use format)
// ---------------------------------------------------------------------------

export const commsToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'send_email',
    description:
      'Send an email via Resend on behalf of the user. IMPORTANT: Always confirm the recipient, subject, and body with the user before sending. Supports plain text and HTML. Do NOT send without explicit user approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        body: {
          type: 'string',
          description: 'Email body (plain text or HTML)',
        },
        reply_to: {
          type: 'string',
          description: 'Optional reply-to address',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'send_sms',
    description:
      'Send an SMS text message via Telnyx. IMPORTANT: Always confirm the recipient and message with the user before sending. Use E.164 phone format (e.g. +61400123456). Messages over 160 chars are split into segments. Do NOT send without explicit user approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string',
          description: 'Recipient phone number (E.164 format preferred, e.g. +61400123456)',
        },
        message: {
          type: 'string',
          description: 'SMS message text (will be split into segments if >160 chars)',
        },
      },
      required: ['to', 'message'],
    },
  },
  // approve_action definition lives in tools.ts (toolDefinitions) to keep it with the comms group.
  // Handler is below in commsToolHandlers.
]

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const commsToolHandlers: Record<string, AgentToolHandler> = {
  async send_email(input, orgId, supabase) {
    const to = input.to as string
    const subject = input.subject as string
    const body = input.body as string
    const replyTo = input.reply_to as string | undefined

    try {
      // Check daily send limit
      const limit = await checkSendLimit(supabase, orgId, 'email')
      if (!limit.allowed) {
        return { success: false, error: `Daily email limit reached (${limit.limit}/day). Try again tomorrow.` }
      }

      // Resolve agent config ID (required FK on approval_queue)
      const agentConfigId = await getDefaultAgentConfigId(supabase, orgId)
      if (!agentConfigId) {
        return { success: false, error: 'No agent configuration found. Set up an agent config first.' }
      }

      // Queue for human approval instead of sending directly
      const approval = await createApproval(supabase, {
        org_id: orgId,
        agent_config_id: agentConfigId,
        action_type: 'send_email',
        action_payload: { to, subject, body, reply_to: replyTo },
        action_summary: `Send email to ${to}: ${subject}`,
        confidence_score: 1.0,
        routing_decision: 'ask',
        priority: 'normal',
      })

      logger.info('[send_email] Queued for approval', { to, subject, org: orgId, approvalId: approval.id })

      return {
        success: true,
        queued: true,
        approvalId: approval.id,
        data: {
          message: 'Email queued for your approval',
          to,
          subject,
          approvalId: approval.id,
        },
      }
    } catch (err) {
      logger.error('[send_email] Error:', err)
      return { success: false, error: `Email error: ${String(err)}` }
    }
  },

  async send_sms(input, orgId, supabase) {
    const to = input.to as string
    const message = input.message as string

    try {
      // Check daily send limit
      const limit = await checkSendLimit(supabase, orgId, 'sms')
      if (!limit.allowed) {
        return { success: false, error: `Daily SMS limit reached (${limit.limit}/day). Try again tomorrow.` }
      }

      // Resolve agent config ID (required FK on approval_queue)
      const agentConfigId = await getDefaultAgentConfigId(supabase, orgId)
      if (!agentConfigId) {
        return { success: false, error: 'No agent configuration found. Set up an agent config first.' }
      }

      // Queue for human approval instead of sending directly
      const approval = await createApproval(supabase, {
        org_id: orgId,
        agent_config_id: agentConfigId,
        action_type: 'send_sms',
        action_payload: { to, message },
        action_summary: `Send SMS to ${to}: ${message.slice(0, 60)}${message.length > 60 ? '...' : ''}`,
        confidence_score: 1.0,
        routing_decision: 'ask',
        priority: 'normal',
      })

      logger.info('[send_sms] Queued for approval', { to, org: orgId, approvalId: approval.id })

      return {
        success: true,
        queued: true,
        approvalId: approval.id,
        data: {
          message: 'SMS queued for your approval',
          to,
          approvalId: approval.id,
        },
      }
    } catch (err) {
      logger.error('[send_sms] Error:', err)
      return { success: false, error: `SMS error: ${String(err)}` }
    }
  },

  async approve_action(input, orgId, supabase) {
    const approvalId = input.approval_id as string | undefined
    const actionDescription = input.action_description as string | undefined

    if (!approvalId && !actionDescription) {
      return { success: false, error: 'Provide either approval_id or action_description' }
    }

    try {
      let approval: ApprovalRecord | null = null

      // Strategy 1: Direct lookup by ID (full or short)
      if (approvalId) {
        approval = await findApprovalById(supabase, orgId, approvalId)
      }

      // Strategy 2: Fuzzy match on pending approvals by description
      if (!approval && actionDescription) {
        approval = await fuzzyMatchApproval(supabase, orgId, actionDescription, 'pending')
      }

      // Strategy 3: Check expired approvals for re-queue (last 7 days)
      if (!approval && actionDescription) {
        const expiredMatch = await fuzzyMatchApproval(supabase, orgId, actionDescription, 'expired')
        if (expiredMatch) {
          const requeued = await requeueExpiredAction(supabase, expiredMatch)
          return {
            success: true,
            data: {
              requeued: true,
              newApprovalId: requeued.id,
              summary: requeued.action_summary,
              message: `Found your expired action: "${requeued.action_summary}". Re-queued with a fresh 24h window. Want me to send it now?`,
            },
          }
        }
      }

      if (!approval) {
        return {
          success: false,
          error: approvalId
            ? `No pending approval found with ID starting with "${approvalId}"`
            : `No pending approval matching "${actionDescription}"`,
        }
      }

      // Resolve the approval as approved via chat
      const resolved = await resolveApproval(supabase, approval.id, 'approved', 'system', 'chat')

      // Execute immediately
      const executionResult = await executeApprovedAction(supabase, resolved)

      return {
        success: executionResult.success,
        data: {
          approvalId: approval.id,
          actionType: approval.action_type,
          summary: approval.action_summary,
          executionResult,
        },
        error: executionResult.error,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)

      if (msg === 'APPROVAL_NOT_FOUND') {
        return { success: false, error: 'Approval not found' }
      }
      if (msg === 'APPROVAL_ALREADY_RESOLVED') {
        return { success: false, error: 'This action has already been resolved' }
      }

      logger.error('[approve_action] Error:', err)
      return { success: false, error: `Approval error: ${msg}` }
    }
  },
}

// ─── approve_action helpers ─────────────────────────────────────────────────

async function findApprovalById(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  orgId: string,
  idOrPrefix: string,
): Promise<ApprovalRecord | null> {
  // Try exact match first
  const { data: exact } = await supabase
    .from('approval_queue')
    .select('*, agent_configs(name)')
    .eq('org_id', orgId)
    .eq('id', idOrPrefix)
    .eq('status', 'pending')
    .single()

  if (exact) return exact as ApprovalRecord

  // Try prefix match (short IDs like "abc12345")
  if (idOrPrefix.length >= 6 && idOrPrefix.length < 36) {
    const { data: prefixMatches } = await supabase
      .from('approval_queue')
      .select('*, agent_configs(name)')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .ilike('id', `${idOrPrefix}%`)
      .limit(2)

    if (prefixMatches && prefixMatches.length === 1) {
      return prefixMatches[0] as ApprovalRecord
    }
  }

  return null
}

async function fuzzyMatchApproval(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  orgId: string,
  description: string,
  statusFilter: 'pending' | 'expired',
): Promise<ApprovalRecord | null> {
  const statuses = statusFilter === 'pending'
    ? ['pending']
    : ['expired', 'auto_expired']

  let query = supabase
    .from('approval_queue')
    .select('*, agent_configs(name)')
    .eq('org_id', orgId)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(10)

  // For expired, only look back 7 days
  if (statusFilter === 'expired') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte('created_at', sevenDaysAgo)
  }

  const { data } = await query
  if (!data || data.length === 0) return null

  // Score each approval against the description
  const descLower = description.toLowerCase()
  const keywords = descLower.split(/\s+/).filter(w => w.length > 2)

  let bestMatch: ApprovalRecord | null = null
  let bestScore = 0

  for (const row of data) {
    const approval = row as ApprovalRecord
    const summary = approval.action_summary.toLowerCase()
    const payloadStr = JSON.stringify(approval.action_payload).toLowerCase()
    const searchable = `${summary} ${payloadStr}`

    let score = 0
    for (const keyword of keywords) {
      if (searchable.includes(keyword)) score += 1
    }

    // Exact substring match on summary gets bonus
    if (summary.includes(descLower)) score += keywords.length

    if (score > bestScore) {
      bestScore = score
      bestMatch = approval
    }
  }

  // Require at least 1 keyword match
  return bestScore > 0 ? bestMatch : null
}
