import { generateText, Output } from 'ai'
import { z } from 'zod'
import { models } from '@/lib/ai'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SentimentLabel = 'positive' | 'neutral' | 'negative'

export interface SentimentResult {
  label: SentimentLabel
  score: number // -1.0 (very negative) to 1.0 (very positive)
  confidence: number // 0-1
  urgency: boolean // true if client seems frustrated/urgent
  keywords: string[] // key phrases driving the sentiment
}

// ---------------------------------------------------------------------------
// Keyword-based fast path (no API call)
// ---------------------------------------------------------------------------

const POSITIVE_SIGNALS = [
  'thanks', 'thank you', 'great', 'awesome', 'perfect', 'love it',
  'well done', 'excellent', 'amazing', 'happy', 'pleased', 'appreciate',
  'good job', 'looks good', 'fantastic', 'wonderful', 'brilliant',
]

const NEGATIVE_SIGNALS = [
  'disappointed', 'frustrated', 'unacceptable', 'angry', 'upset',
  'not happy', 'terrible', 'awful', 'horrible', 'complaint',
  'still waiting', 'no response', 'not working', 'broken', 'urgent',
  'asap', 'immediately', 'overdue', 'unresolved', 'escalate',
  'worst', 'disgusted', 'furious', 'ridiculous',
]

const URGENCY_SIGNALS = [
  'urgent', 'asap', 'immediately', 'right now', 'critical',
  'emergency', 'still waiting', 'no response', 'escalate',
  'deadline', 'overdue',
]

/**
 * Fast keyword-based sentiment analysis. No API call.
 * Good for quick triage; use analyzeSentimentWithLLM for nuanced analysis.
 */
export function analyzeSentimentFast(text: string): SentimentResult {
  const lower = text.toLowerCase()

  const positiveHits = POSITIVE_SIGNALS.filter(s => lower.includes(s))
  const negativeHits = NEGATIVE_SIGNALS.filter(s => lower.includes(s))
  const urgencyHits = URGENCY_SIGNALS.filter(s => lower.includes(s))

  const posScore = positiveHits.length
  const negScore = negativeHits.length
  const netScore = posScore - negScore

  let label: SentimentLabel
  let score: number

  if (netScore > 0) {
    label = 'positive'
    score = Math.min(1, netScore * 0.3)
  } else if (netScore < 0) {
    label = 'negative'
    score = Math.max(-1, netScore * 0.3)
  } else {
    label = 'neutral'
    score = 0
  }

  return {
    label,
    score,
    confidence: Math.min(1, (posScore + negScore) * 0.2) || 0.3,
    urgency: urgencyHits.length > 0,
    keywords: [...positiveHits, ...negativeHits].slice(0, 5),
  }
}

// ---------------------------------------------------------------------------
// LLM-based sentiment (Haiku for cost)
// ---------------------------------------------------------------------------

// Zod schema for structured sentiment output
const SentimentSchema = z.object({
  label: z.enum(['positive', 'neutral', 'negative']),
  score: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  urgency: z.boolean(),
  keywords: z.array(z.string()).max(5),
})

/**
 * Analyze sentiment using Claude Haiku via AI SDK generateObject.
 * Falls back to keyword-based on failure.
 */
export async function analyzeSentiment(text: string): Promise<SentimentResult> {
  if (!text || text.length < 10) {
    return { label: 'neutral', score: 0, confidence: 0.5, urgency: false, keywords: [] }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return analyzeSentimentFast(text)
  }

  try {
    const truncated = text.length > 1000 ? text.slice(0, 1000) + '...' : text

    const { output: object } = await generateText({
      model: models.fast,
      output: Output.object({ schema: SentimentSchema }),
      maxOutputTokens: 200,
      prompt: `Analyze the sentiment of this client message.

Message: "${truncated}"

Return the sentiment label (positive/neutral/negative), a score from -1.0 to 1.0, confidence 0-1, whether it's urgent, and key phrases driving the sentiment.`,
    })

    if (!object) return analyzeSentimentFast(text)

    return {
      label: object.label,
      score: Math.max(-1, Math.min(1, object.score)),
      confidence: Math.max(0, Math.min(1, object.confidence)),
      urgency: object.urgency,
      keywords: object.keywords.slice(0, 5),
    }
  } catch {
    return analyzeSentimentFast(text)
  }
}