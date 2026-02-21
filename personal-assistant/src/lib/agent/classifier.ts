import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelMessage } from '@/lib/channels/types'
import Anthropic from '@anthropic-ai/sdk'

export interface ClassificationResult {
  significance: number // 1-10
  timeSensitivity: 'immediate' | 'today' | 'this_week' | 'whenever' | 'none'
  recommendedActions: string[] // e.g., ["reply", "create_task", "forward_to_lead_swarm"]
  reasoning: string
  category: 'lead' | 'client' | 'vendor' | 'personal' | 'spam' | 'notification' | 'newsletter'
}

const DEFAULT_RESULT: ClassificationResult = {
  significance: 2,
  timeSensitivity: 'none',
  recommendedActions: [],
  reasoning: 'Classification failed -- defaulting to low significance',
  category: 'notification',
}

const MAX_BODY_LENGTH = 2000

function buildClassificationPrompt(message: ChannelMessage): string {
  const body = message.body.length > MAX_BODY_LENGTH
    ? message.body.slice(0, MAX_BODY_LENGTH) + '...[truncated]'
    : message.body

  return `Classify this message. Return ONLY valid JSON matching the schema below.

Message:
- Sender: ${message.sender}${message.senderEmail ? ` <${message.senderEmail}>` : ''}
- Subject: ${message.subject ?? '(no subject)'}
- Body: ${body}

Return JSON:
{
  "significance": <1-10>,
  "timeSensitivity": "<immediate|today|this_week|whenever|none>",
  "recommendedActions": ["<action1>", ...],
  "reasoning": "<brief explanation>",
  "category": "<lead|client|vendor|personal|spam|notification|newsletter>"
}

Scoring guidelines:
- 10: Business-critical (contract, legal, payment dispute)
- 7-9: Important client/lead communication
- 4-6: Routine business (status updates, scheduling)
- 1-3: Newsletter, spam, noise, automated notifications`
}

function parseClassificationResponse(text: string): ClassificationResult {
  // Extract JSON from response -- handle markdown code blocks
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response')

  const parsed = JSON.parse(jsonMatch[0])

  // Validate and clamp significance
  const significance = Math.max(1, Math.min(10, Math.round(Number(parsed.significance) || 2)))

  const validSensitivities = ['immediate', 'today', 'this_week', 'whenever', 'none'] as const
  const timeSensitivity = validSensitivities.includes(parsed.timeSensitivity)
    ? parsed.timeSensitivity
    : 'none'

  const validCategories = ['lead', 'client', 'vendor', 'personal', 'spam', 'notification', 'newsletter'] as const
  const category = validCategories.includes(parsed.category)
    ? parsed.category
    : 'notification'

  return {
    significance,
    timeSensitivity,
    recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
    reasoning: String(parsed.reasoning ?? ''),
    category,
  }
}

/**
 * Classify a message using Haiku for cost-optimized significance scoring.
 * Never throws -- returns default low-significance result on failure.
 */
export async function classifyMessage(
  supabase: SupabaseClient,
  message: ChannelMessage,
  orgId: string,
): Promise<ClassificationResult> {
  try {
    const client = new Anthropic()
    const prompt = buildClassificationPrompt(message)

    const response = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.warn('[classifier] No text block in response')
      return DEFAULT_RESULT
    }

    const result = parseClassificationResponse(textBlock.text)

    // Store classification on the message row
    await supabase
      .from('channel_messages')
      .update({
        significance: result.significance,
        time_sensitivity: result.timeSensitivity,
        recommended_actions: result.recommendedActions,
        classification_model: 'claude-3-5-haiku-latest',
        classified_at: new Date().toISOString(),
      })
      .eq('id', message.id)

    return result
  } catch (err) {
    console.warn('[classifier] Classification failed:', err)
    return DEFAULT_RESULT
  }
}

// Exported for testing
export { buildClassificationPrompt, parseClassificationResponse, DEFAULT_RESULT }
