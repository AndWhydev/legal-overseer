/**
 * Meeting AI Extraction Pipeline
 *
 * Uses Anthropic Claude to extract structured intelligence from transcripts:
 * - Summary with key decisions
 * - Action items with assignments and deadlines
 * - Semantic topic chapters (not time-based chunking)
 * - Follow-up email draft
 * - Sentiment analysis
 *
 * Design decisions:
 * - Batch extraction: sends entire transcript in one structured prompt
 *   (95% cheaper than segment-by-segment, per YouTube Clipper research)
 * - Semantic chunking: identifies topic transitions instead of fixed intervals
 * - Uses Haiku for classification, Sonnet for extraction (cost optimization)
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { resolveModel } from '@/lib/agent/model-registry'
import {
  updateMeetingSummary,
  insertActionItems,
  insertFollowUp,
} from './meeting-service'
import type {
  TranscriptSegment,
  MeetingExtraction,
  ExtractedActionItem,
  ExtractedFollowUp,
  SentimentLabel,
  MeetingParticipant,
} from './types'

// ── Extraction Prompt ───────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are an expert meeting analyst. Given a meeting transcript, extract structured intelligence.

Your output MUST be valid JSON matching this schema:
{
  "summary": "2-4 sentence meeting summary focusing on outcomes and decisions",
  "key_decisions": ["Decision 1", "Decision 2"],
  "topics": [
    {
      "title": "Topic Name",
      "start_segment": 0,
      "end_segment": 5,
      "summary": "Brief summary of this topic discussion"
    }
  ],
  "action_items": [
    {
      "title": "Clear, actionable task title",
      "description": "Additional context if needed",
      "assigned_to": "Person Name or null",
      "due_date": "YYYY-MM-DD or null",
      "priority": "high|medium|low",
      "source_quote": "The exact quote from the transcript"
    }
  ],
  "follow_up_email": {
    "subject": "Meeting Follow-up: [Topic]",
    "body": "Professional follow-up email with summary and action items",
    "recipients": ["person@example.com or Name"]
  } or null,
  "sentiment": {
    "score": 0.0 to 1.0 (0=very negative, 0.5=neutral, 1.0=very positive),
    "label": "very_positive|positive|neutral|negative|very_negative"
  }
}

Rules:
- Extract ALL commitments as action items, even implicit ones ("I'll send that over" = action item)
- Parse relative dates ("by Friday", "next week") into actual dates when possible. Today is {today}.
- Assign action items to the person who committed, not the person who requested
- The follow-up email should be professional and concise
- Identify semantic topic transitions — don't split by fixed time intervals
- Be thorough: better to extract too many action items than too few
- For the source_quote, use the EXACT text from the transcript`

// ── Main Extraction ─────────────────────────────────────────────────────────

/**
 * Run AI extraction on a meeting transcript.
 * Processes the full transcript in a single batch for cost efficiency.
 */
export async function extractMeetingIntelligence(
  transcript: string,
  participants: MeetingParticipant[],
  meetingTitle: string,
  meetingType: string
): Promise<MeetingExtraction | null> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    logger.error('[ai-extraction] ANTHROPIC_API_KEY not configured')
    return null
  }

  const today = new Date().toISOString().split('T')[0]
  const systemPrompt = EXTRACTION_SYSTEM_PROMPT.replace('{today}', today)

  const participantList = participants.length > 0
    ? `Participants: ${participants.map(p => `${p.name}${p.email ? ` (${p.email})` : ''} [${p.role}]`).join(', ')}`
    : ''

  const userPrompt = `Meeting: "${meetingTitle}" (${meetingType})
${participantList}

TRANSCRIPT:
${transcript}

Extract the structured meeting intelligence as JSON.`

  try {
    const client = new Anthropic({ apiKey: anthropicKey })
    const response = await client.messages.create({
      model: resolveModel('synthesis'),
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const responseText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    // Parse JSON from response (may be wrapped in markdown code block)
    const jsonStr = extractJsonFromResponse(responseText)
    if (!jsonStr) {
      logger.error('[ai-extraction] Failed to extract JSON from response')
      return null
    }

    const extraction = JSON.parse(jsonStr) as MeetingExtraction

    logger.info('[ai-extraction] Extraction complete:', {
      actionItems: extraction.action_items?.length ?? 0,
      decisions: extraction.key_decisions?.length ?? 0,
      sentiment: extraction.sentiment?.label,
      tokens: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    })

    return extraction
  } catch (err) {
    logger.error('[ai-extraction] Extraction failed:', err)
    return null
  }
}

/**
 * Run the full extraction pipeline: extract intelligence and store results.
 */
export async function runExtractionPipeline(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
  transcript: string,
  participants: MeetingParticipant[],
  meetingTitle: string,
  meetingType: string
): Promise<{
  success: boolean
  actionItemCount: number
  followUpCreated: boolean
  error?: string
}> {
  logger.info('[ai-extraction] Running extraction pipeline for meeting:', meetingId)

  const extraction = await extractMeetingIntelligence(
    transcript,
    participants,
    meetingTitle,
    meetingType
  )

  if (!extraction) {
    return {
      success: false,
      actionItemCount: 0,
      followUpCreated: false,
      error: 'AI extraction returned no results',
    }
  }

  // 1. Update meeting with summary and sentiment
  const sentimentScore = extraction.sentiment?.score ?? 0.5
  const sentimentLabel = extraction.sentiment?.label ?? 'neutral'
  await updateMeetingSummary(
    supabase,
    meetingId,
    extraction.summary,
    extraction.key_decisions || [],
    sentimentScore,
    sentimentLabel
  )

  // 2. Insert action items
  const actionItems = await insertActionItems(
    supabase,
    meetingId,
    orgId,
    (extraction.action_items || []).map(item => ({
      title: item.title,
      description: item.description,
      assigned_to: item.assigned_to || undefined,
      due_date: item.due_date || undefined,
      priority: item.priority,
      source_quote: item.source_quote,
      confidence: 0.85,
    }))
  )

  // 3. Insert follow-up email if generated
  let followUpCreated = false
  if (extraction.follow_up_email) {
    const followUp = await insertFollowUp(
      supabase,
      meetingId,
      orgId,
      {
        follow_up_type: 'email',
        subject: extraction.follow_up_email.subject,
        body: extraction.follow_up_email.body,
        recipient_name: extraction.follow_up_email.recipients?.[0] || undefined,
      }
    )
    followUpCreated = !!followUp
  }

  logger.info('[ai-extraction] Pipeline complete:', {
    meetingId,
    actionItems: actionItems.length,
    followUpCreated,
  })

  return {
    success: true,
    actionItemCount: actionItems.length,
    followUpCreated,
  }
}

// ── Action Item → Kanban Task Conversion ────────────────────────────────────

/**
 * Convert meeting action items to kanban tasks.
 * Links the action item to the created task.
 */
export async function convertActionItemsToTasks(
  supabase: SupabaseClient,
  orgId: string,
  meetingId: string,
  meetingTitle: string
): Promise<number> {
  // Get pending action items for the meeting
  const { data: actionItems, error } = await supabase
    .from('meeting_action_items')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('status', 'pending')
    .is('task_id', null)

  if (error || !actionItems || actionItems.length === 0) {
    return 0
  }

  // Get the "To Do" column
  const { data: column } = await supabase
    .from('kanban_columns')
    .select('id')
    .eq('org_id', orgId)
    .ilike('title', 'To Do')
    .limit(1)
    .single()

  const columnId = column?.id

  let converted = 0

  for (const item of actionItems) {
    // Create task
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .insert({
        org_id: orgId,
        title: item.title,
        description: `${item.description || ''}\n\nFrom meeting: ${meetingTitle}${item.source_quote ? `\n\nContext: "${item.source_quote}"` : ''}`.trim(),
        priority: item.priority || 'medium',
        column_id: columnId,
        position: 0,
        assigned_to: item.assigned_to,
        metadata: {
          source: 'meeting',
          meeting_id: meetingId,
          tags: ['meeting-action-item'],
        },
      })
      .select('id')
      .single()

    if (taskErr || !task) {
      logger.warn('[ai-extraction] Failed to create task for action item:', taskErr?.message)
      continue
    }

    // Link action item to task
    await supabase
      .from('meeting_action_items')
      .update({ task_id: task.id, status: 'in_progress' })
      .eq('id', item.id)

    converted++
  }

  logger.info('[ai-extraction] Converted action items to tasks:', {
    meetingId,
    converted,
    total: actionItems.length,
  })

  return converted
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract JSON from an LLM response that may include markdown code blocks.
 */
function extractJsonFromResponse(text: string): string | null {
  // Try direct parse first
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    return trimmed
  }

  // Try extracting from markdown code block
  const jsonMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (jsonMatch?.[1]) {
    return jsonMatch[1].trim()
  }

  // Try finding first { to last }
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  return null
}

/**
 * Build a compact transcript string from segments.
 * Includes speaker labels and timestamps for context.
 */
export function buildTranscriptText(
  segments: TranscriptSegment[],
  options?: { includeSpeakers?: boolean; includeTimestamps?: boolean }
): string {
  const includeSpeakers = options?.includeSpeakers ?? true
  const includeTimestamps = options?.includeTimestamps ?? false

  return segments.map(seg => {
    const parts: string[] = []
    if (includeTimestamps) {
      parts.push(`[${formatTime(seg.start_time_ms)}]`)
    }
    if (includeSpeakers && seg.speaker_label) {
      parts.push(`${seg.speaker_label}:`)
    }
    parts.push(seg.text)
    return parts.join(' ')
  }).join('\n')
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
