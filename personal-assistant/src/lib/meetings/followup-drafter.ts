/**
 * Follow-up Email Drafter
 *
 * Generates post-meeting summary emails with action items.
 * Routes through the existing approval queue before sending.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveModel } from '@/lib/agent/model-registry'
import { queueAgentAction } from '@/lib/agent/approval-queue'
import { logger } from '@/lib/core/logger'
import type { Meeting, MeetingParticipant, MeetingActionItem } from './types'

const anthropic = new Anthropic()

export interface FollowUpDraft {
  subject: string
  body: string
  recipients: string[]
}

/**
 * Generate a follow-up email draft from meeting data.
 */
export async function draftFollowUpEmail(
  meeting: Meeting,
  participants: MeetingParticipant[],
  actionItems: MeetingActionItem[],
): Promise<FollowUpDraft> {
  const recipientEmails = participants
    .filter(p => p.email)
    .map(p => p.email!)

  if (recipientEmails.length === 0) {
    return {
      subject: `Follow-up: ${meeting.title}`,
      body: 'No participant emails available to generate follow-up.',
      recipients: [],
    }
  }

  const model = resolveModel('conversation')

  const actionList = actionItems
    .map(a => {
      const assignee = a.assigned_to ? ` (${a.assigned_to})` : ''
      const due = a.due_date ? ` — due ${a.due_date}` : ''
      return `- ${a.title}${assignee}${due}`
    })
    .join('\n')

  const participantNames = participants.map(p => p.name).join(', ')

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: `You are writing a professional post-meeting follow-up email. Be concise, warm but professional. Include:
1. Brief thank you for the meeting
2. Key decisions made
3. Action items with owners and deadlines
4. Next steps

Keep it under 200 words. Do not include greeting/closing — those will be added by the system.`,
      messages: [{
        role: 'user',
        content: `Meeting: ${meeting.title}
Date: ${meeting.started_at ?? meeting.created_at}
Participants: ${participantNames}
Summary: ${meeting.summary ?? 'No summary available'}
Key Decisions: ${(meeting.key_decisions ?? []).join('; ') || 'None recorded'}
Action Items:
${actionList || 'None'}`,
      }],
    })

    const body = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    return {
      subject: `Follow-up: ${meeting.title}`,
      body: body.trim(),
      recipients: recipientEmails,
    }
  } catch (err) {
    logger.error('[followup-drafter] Failed to generate email:', err)
    return {
      subject: `Follow-up: ${meeting.title}`,
      body: `Meeting Summary:\n${meeting.summary ?? 'N/A'}\n\nAction Items:\n${actionList || 'None'}`,
      recipients: recipientEmails,
    }
  }
}

/**
 * Queue a follow-up email through the approval system.
 */
export async function queueFollowUpEmail(
  supabase: SupabaseClient,
  orgId: string,
  meetingId: string,
  draft: FollowUpDraft,
): Promise<string | null> {
  try {
    const approval = await queueAgentAction(supabase, {
      org_id: orgId,
      agent_config_id: 'meeting-followup',
      action_type: 'send_email',
      action_payload: {
        to: draft.recipients,
        subject: draft.subject,
        body: draft.body,
        source: 'meeting_followup',
        meeting_id: meetingId,
      },
      action_summary: `Send meeting follow-up email: "${draft.subject}" to ${draft.recipients.length} recipients`,
      confidence_score: 0.7, // Medium confidence — requires approval
    })

    return approval?.id ?? null
  } catch (err) {
    logger.error('[followup-drafter] Failed to queue email:', err)
    return null
  }
}
