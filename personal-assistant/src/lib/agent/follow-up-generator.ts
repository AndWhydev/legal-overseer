/**
 * Follow-up Suggestion Generator
 *
 * After the TAOR loop produces a response, this module generates 2-3 concise
 * follow-up suggestions using Gemini Flash. The suggestions appear as tappable
 * chips below the assistant message.
 *
 * Design constraints:
 * - Each suggestion <= 60 chars, natural language, actionable
 * - Uses the cheapest/fastest model (Gemini Flash)
 * - Best-effort — failures return []
 * - Hard timeout caps added latency when the caller awaits this function
 */

import { generateText, gateway } from 'ai'
import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'

const TIMEOUT_MS = 3_000
const MAX_SUGGESTIONS = 3

const SYSTEM_PROMPT = `You generate follow-up suggestions for an AI assistant chat interface. Given the user's message and the assistant's response, produce 2-3 short follow-up prompts the user might want to ask next.

Rules:
- Each suggestion must be under 60 characters
- Write in first person as if the user is asking (e.g. "Show me the details" not "Would you like to see details?")
- Be specific to the conversation — no generic suggestions
- Don't repeat what the user already asked
- Don't suggest asking about things the assistant already fully answered
- Focus on natural next steps, deeper dives, or related actions
- If the response contains actionable items, suggest executing them
- If the response is a simple acknowledgment or greeting, return an empty array

Return ONLY a JSON array of strings. No explanation.
Examples: ["Check the invoice status", "Draft a follow-up email", "Show me the timeline"]
If no good follow-ups exist, return: []`

export async function generateFollowUps(
  userMessage: string,
  assistantResponse: string,
): Promise<string[]> {
  try {
    // Skip for very short responses (greetings, acks)
    if (assistantResponse.length < 80) return []

    // Truncate to avoid wasting tokens on long responses
    const truncatedResponse = assistantResponse.length > 800
      ? assistantResponse.slice(0, 800) + '...'
      : assistantResponse

    const { text } = await generateText({
      model: gateway(models.fast),
      system: SYSTEM_PROMPT,
      prompt: `User: ${userMessage}\n\nAssistant: ${truncatedResponse}`,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const parsed = JSON.parse(text.trim())
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= 60)
      .slice(0, MAX_SUGGESTIONS)
  } catch (err) {
    // Silent failure — follow-ups are non-critical
    logger.debug('[follow-ups] generation failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
