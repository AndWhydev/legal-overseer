/**
 * Meeting Action Extractor
 *
 * Two-pass AI extraction:
 * 1. Haiku classifies segments as actionable (fast, cheap)
 * 2. Sonnet extracts structured action items from actionable segments
 *
 * Also generates meeting summary, key decisions, and sentiment.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveModel } from '@/lib/agent/model-registry'
import { logger } from '@/lib/core/logger'
import type {
  TranscriptSegment,
  MeetingActionItem,
  SentimentLabel,
} from './types'

interface ActionExtractionResult {
  actions: Array<{
    title: string
    description: string
    assignee_name?: string | null
    due_date_raw?: string | null
    source_text?: string
    confidence: number
    priority: 'critical' | 'high' | 'medium' | 'low'
  }>
  summary: string
  key_decisions: string[]
  sentiment: { score: number; label: SentimentLabel | 'neutral' | 'positive' | 'negative' | 'mixed' }
}

const anthropic = new Anthropic()

/**
 * Extract action items, summary, decisions, and sentiment from transcript segments.
 */
export async function extractMeetingIntelligence(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
  segments: TranscriptSegment[],
): Promise<ActionExtractionResult> {
  if (segments.length === 0) {
    return {
      actions: [],
      summary: 'No transcript content available.',
      key_decisions: [],
      sentiment: { score: 0, label: 'neutral' },
    }
  }

  // Build full transcript text with timestamps
  const transcriptText = segments
    .map(s => {
      const speaker = s.speaker_label || 'Unknown'
      const time = formatTimestamp(s.start_time_ms / 1000)
      return `[${time}] ${speaker}: ${s.text}`
    })
    .join('\n')

  // Truncate to avoid token limits (~100k chars ≈ 25k tokens)
  const truncatedTranscript = transcriptText.length > 100_000
    ? transcriptText.slice(0, 100_000) + '\n[... transcript truncated ...]'
    : transcriptText

  // Single pass with Sonnet for extraction + summary
  const result = await extractWithSonnet(truncatedTranscript)

  // Mark actionable segments
  await markActionableSegments(supabase, meetingId, segments, result.actions)

  // Store action items
  const actionItems = await storeActionItems(supabase, meetingId, orgId, result.actions, segments)

  // Update meeting with summary, decisions, sentiment
  await supabase
    .from('meetings')
    .update({
      status: 'processing',
      summary: result.summary,
      key_decisions: result.key_decisions,
      sentiment_score: result.sentiment.score,
      sentiment_label: result.sentiment.label,
    })
    .eq('id', meetingId)

  return result
}

async function extractWithSonnet(transcript: string): Promise<ActionExtractionResult> {
  const model = resolveModel('conversation')

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: `You are a meeting intelligence assistant. Analyze the meeting transcript and extract:

1. ACTION ITEMS: Commitments, tasks, and follow-ups mentioned by participants. For each:
   - title: Clear, actionable task title
   - description: What needs to be done
   - assignee_name: Who committed to doing it (from the transcript)
   - due_date_raw: Any mentioned deadline ("by Friday", "next week", etc.) or null
   - source_text: The exact quote from the transcript
   - confidence: How confident you are this is a real action item (0-1)
   - priority: critical, high, medium, or low

2. SUMMARY: A concise 2-4 sentence summary of the meeting.

3. KEY DECISIONS: List of decisions made during the meeting.

4. SENTIMENT: Overall meeting sentiment (-1 to 1) and label (positive/neutral/negative/mixed).

Respond with ONLY valid JSON matching this schema:
{
  "actions": [{ "title": "", "description": "", "assignee_name": null, "due_date_raw": null, "source_text": "", "confidence": 0.9, "priority": "medium" }],
  "summary": "",
  "key_decisions": [""],
  "sentiment": { "score": 0, "label": "neutral" }
}`,
      messages: [{
        role: 'user',
        content: `Analyze this meeting transcript:\n\n${transcript}`,
      }],
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    // Parse JSON from response — handle code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text]
    const jsonStr = (jsonMatch[1] ?? text).trim()

    const parsed = JSON.parse(jsonStr) as ActionExtractionResult

    // Validate structure
    if (!Array.isArray(parsed.actions)) parsed.actions = []
    if (typeof parsed.summary !== 'string') parsed.summary = ''
    if (!Array.isArray(parsed.key_decisions)) parsed.key_decisions = []
    if (!parsed.sentiment) parsed.sentiment = { score: 0, label: 'neutral' }

    return parsed
  } catch (err) {
    logger.error('[action-extractor] Extraction failed:', err)
    return {
      actions: [],
      summary: 'Failed to generate meeting summary.',
      key_decisions: [],
      sentiment: { score: 0, label: 'neutral' },
    }
  }
}

/**
 * Mark transcript segments that contain action items.
 */
async function markActionableSegments(
  supabase: SupabaseClient,
  meetingId: string,
  segments: TranscriptSegment[],
  actions: ActionExtractionResult['actions'],
): Promise<void> {
  if (actions.length === 0) return

  // Find segments that match action source text
  const actionableIds: string[] = []

  for (const action of actions) {
    if (!action.source_text) continue

    const sourceWords = action.source_text.toLowerCase().split(/\s+/).slice(0, 5)
    for (const seg of segments) {
      const segLower = seg.text.toLowerCase()
      const matchCount = sourceWords.filter(w => segLower.includes(w)).length
      if (matchCount >= Math.min(3, sourceWords.length)) {
        actionableIds.push(seg.id)
        break
      }
    }
  }

  if (actionableIds.length > 0) {
    await supabase
      .from('meeting_transcript_segments')
      .update({ is_actionable: true })
      .eq('meeting_id', meetingId)
      .in('id', actionableIds)
  }
}

/**
 * Store extracted action items in the database.
 */
async function storeActionItems(
  supabase: SupabaseClient,
  meetingId: string,
  orgId: string,
  actions: ActionExtractionResult['actions'],
  segments: TranscriptSegment[],
): Promise<MeetingActionItem[]> {
  if (actions.length === 0) return []

  const rows = actions.map(action => {
    // Find best matching segment for source reference
    let sourceSegmentId: string | null = null
    if (action.source_text) {
      const sourceWords = action.source_text.toLowerCase().split(/\s+/).slice(0, 5)
      for (const seg of segments) {
        const segLower = seg.text.toLowerCase()
        const matchCount = sourceWords.filter(w => segLower.includes(w)).length
        if (matchCount >= Math.min(3, sourceWords.length)) {
          sourceSegmentId = seg.id
          break
        }
      }
    }

    return {
      meeting_id: meetingId,
      org_id: orgId,
      title: action.title,
      description: action.description,
      assignee_name: action.assignee_name,
      due_date_raw: action.due_date_raw,
      source_segment_id: sourceSegmentId,
      source_text: action.source_text,
      confidence: action.confidence,
      priority: action.priority,
      status: 'pending' as const,
    }
  })

  const { data, error } = await supabase
    .from('meeting_action_items')
    .insert(rows)
    .select()

  if (error) {
    logger.error('[action-extractor] Failed to store action items:', error.message)
    return []
  }

  return (data ?? []) as MeetingActionItem[]
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}