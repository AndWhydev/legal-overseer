/**
 * Human Handoff Tool
 *
 * Pauses the current agent task and notifies the user that manual intervention
 * is required. Reuses the approval_queue table with action_type='human_handoff'
 * and confidence_score=0 (always requires human).
 *
 * Part of the tiered tool resolution system (42-03):
 *   api → browser → workspace → human
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createApproval } from '../approval-queue'
import { notifyApproval } from '../approval-notifier'
import { logger } from '@/lib/core/logger'
import type { ToolResult } from '../tools'

// ---------------------------------------------------------------------------
// Tool definition (Anthropic tool format)
// ---------------------------------------------------------------------------

export const humanHandoffToolDefinition: Anthropic.Tool = {
  name: 'request_human_handoff',
  description:
    'Escalate a task to the human user when automated tools cannot complete it. ' +
    'Use when all automated tiers (API, browser, workspace) have been exhausted or ' +
    'the task inherently requires human judgment, physical action, or access the agent lacks. ' +
    'Creates an approval record and notifies the user with full context.',
  input_schema: {
    type: 'object' as const,
    properties: {
      description: {
        type: 'string',
        description:
          'Clear description of what the agent needs the human to do. ' +
          'Be specific — include account names, URLs, or exact steps if known.',
      },
      expected_result: {
        type: 'string',
        description:
          'What the agent expects back from the human (e.g. "confirmation that the payment was made", ' +
          '"the verification code from the SMS", "a screenshot of the settings page").',
      },
      context: {
        type: 'object',
        description: 'Optional context about the handoff.',
        properties: {
          service: {
            type: 'string',
            description: 'The service or platform involved (e.g. "Stripe", "Gmail", "physical store").',
          },
          attempted_tiers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Which automated tiers were attempted before escalating (e.g. ["api", "browser"]).',
          },
          reason: {
            type: 'string',
            description: 'Why automated tools could not complete the task.',
          },
          url: {
            type: 'string',
            description: 'Relevant URL the human should visit, if applicable.',
          },
        },
      },
      urgency: {
        type: 'string',
        enum: ['urgent', 'normal', 'low'],
        description:
          'How time-sensitive the handoff is. Defaults to "normal". ' +
          'Use "urgent" only when the task is blocking a critical workflow.',
      },
    },
    required: ['description', 'expected_result'] as string[],
  },
}

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

interface HumanHandoffInput {
  description: string
  expected_result: string
  context?: {
    service?: string
    attempted_tiers?: string[]
    reason?: string
    url?: string
  }
  urgency?: 'urgent' | 'normal' | 'low'
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleHumanHandoff(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
  execOptions?: { agentConfigId?: string },
): Promise<ToolResult> {
  const parsed: HumanHandoffInput = {
    description: input.description as string,
    expected_result: input.expected_result as string,
    context: input.context as HumanHandoffInput['context'],
    urgency: (input.urgency as HumanHandoffInput['urgency']) ?? 'normal',
  }

  if (!parsed.description || !parsed.expected_result) {
    return {
      success: false,
      error: 'Both "description" and "expected_result" are required for a human handoff.',
    }
  }

  const priority = parsed.urgency ?? 'normal'

  // Build a human-readable summary for the approval record
  const summary = `Human handoff: ${parsed.description}`

  try {
    const approval = await createApproval(supabase, {
      org_id: orgId,
      // Use a sentinel config ID when none is provided (e.g. chat-initiated handoffs).
      // The approval_queue table requires a non-null agent_config_id.
      agent_config_id: execOptions?.agentConfigId ?? '00000000-0000-0000-0000-000000000000',
      action_type: 'human_handoff',
      action_payload: {
        description: parsed.description,
        expected_result: parsed.expected_result,
        ...(parsed.context ?? {}),
      },
      action_summary: summary.length > 200 ? summary.slice(0, 197) + '...' : summary,
      confidence_score: 0, // Always requires human — never auto-act
      routing_decision: 'escalate',
      priority,
      context_snapshot: {
        expected_result: parsed.expected_result,
        service: parsed.context?.service,
        attempted_tiers: parsed.context?.attempted_tiers,
        reason: parsed.context?.reason,
        url: parsed.context?.url,
      },
    })

    // Fire-and-forget notification — createApproval already dispatches its own
    // notifications, but we call notifyApproval again to ensure the WhatsApp/email
    // path fires (createApproval's internal call is also fire-and-forget and may
    // race). The notifier is idempotent for a given approval record.
    notifyApproval(supabase, approval).catch((err) => {
      logger.warn('[human-handoff] notifyApproval failed:', err)
    })

    return {
      success: true,
      queued: true,
      approvalId: approval.id,
      data: {
        approvalId: approval.id,
        description: parsed.description,
        expected_result: parsed.expected_result,
        urgency: priority,
        message:
          'Task has been escalated to the user. They will be notified and can respond via the dashboard, WhatsApp, or chat.',
      },
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[human-handoff] Failed to create handoff approval:', { error: errorMsg })
    return {
      success: false,
      error: `Failed to create human handoff: ${errorMsg}`,
    }
  }
}
