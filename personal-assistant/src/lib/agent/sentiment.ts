import Anthropic from '@anthropic-ai/sdk'
import { resolveModel } from '@/lib/agent/model-registry'

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

/**
 * Analyze sentiment using Claude Haiku.
 * Falls back to keyword-based on failure.
 */
export async function analyzeSentiment(text: string): Promise<SentimentResult> {
  if (!text || text.length < 10) {
    return { label: 'neutral', score: 0, confidence: 0.5, urgency: false, keywords: [] }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return analyzeSentimentFast(text)
  }

  try {
    const client = new Anthropic({ apiKey })

    const truncated = text.length > 1000 ? text.slice(0, 1000) + '...' : text

    const response = await client.messages.create({
      model: resolveModel('classification'),
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Analyze the sentiment of this client message. Return ONLY valid JSON.

Message: "${truncated}"

Return JSON:
{
  "label": "positive" | "neutral" | "negative",
  "score": <-1.0 to 1.0>,
  "confidence": <0-1>,
  "urgency": <true|false>,
  "keywords": ["key phrase 1", "key phrase 2"]
}`,
      }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return analyzeSentimentFast(text)
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return analyzeSentimentFast(text)
    }

    const parsed = JSON.parse(jsonMatch[0])

    const validLabels: SentimentLabel[] = ['positive', 'neutral', 'negative']
    const label = validLabels.includes(parsed.label) ? parsed.label : 'neutral'
    const score = Math.max(-1, Math.min(1, Number(parsed.score) || 0))
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5))

    return {
      label,
      score,
      confidence,
      urgency: Boolean(parsed.urgency),
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : [],
    }
  } catch {
    return analyzeSentimentFast(text)
  }
}
