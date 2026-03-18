/**
 * Ingest-Time Enrichment Pipeline
 *
 * Runs when new emails/messages arrive during channel-sync, enriching them
 * BEFORE they sit in the inbox. Produces summary, urgency score, entities,
 * action items, and category tag — all stored in channel_messages.metadata.
 *
 * Design: fire-and-forget safe (never throws), logs warnings on failure.
 * LLM usage: only the one-line summary uses Haiku; everything else is
 * regex/heuristic for speed and cost.
 *
 * @module intelligence/ingest-enrichment
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveModel } from '@/lib/agent/model-registry'
import { extractEntities } from '@/lib/rag/entity-extractor'
import { logger } from '@/lib/core/logger'

// ─── Types ───────────────────────────────────────────────────────────────

/** Minimal channel_messages row needed for enrichment */
export interface IngestMessage {
  id: string
  org_id: string
  channel: string
  sender: string
  sender_email?: string | null
  subject?: string | null
  body: string
  received_at: string
  metadata?: Record<string, unknown>
}

export type EnrichmentCategory =
  | 'billing'
  | 'project_update'
  | 'client_request'
  | 'personal'
  | 'newsletter'
  | 'notification'

export interface EnrichmentResult {
  summary: string
  urgency_score: number
  entity_ids: string[]
  action_items: string[]
  enrichment_category: EnrichmentCategory
  enriched_at: string
}

// ─── Constants ───────────────────────────────────────────────────────────

/** Max body length sent to Haiku for summarisation */
const MAX_SUMMARY_BODY = 1500

/** Urgency keyword patterns with weights */
const URGENCY_KEYWORDS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\burgent\b/i, weight: 0.25 },
  { pattern: /\basap\b/i, weight: 0.25 },
  { pattern: /\bimmediately\b/i, weight: 0.2 },
  { pattern: /\bcritical\b/i, weight: 0.2 },
  { pattern: /\btime[- ]?sensitive\b/i, weight: 0.15 },
  { pattern: /\bright\s+away\b/i, weight: 0.15 },
  { pattern: /\bdeadline\b/i, weight: 0.15 },
  { pattern: /\boverdue\b/i, weight: 0.2 },
  { pattern: /\bfinal\s+notice\b/i, weight: 0.25 },
  { pattern: /\blast\s+chance\b/i, weight: 0.15 },
]

/** Deadline mention patterns */
const DEADLINE_PATTERNS = [
  /\bby\s+(?:end\s+of\s+)?(?:today|tonight|tomorrow|eod|eow|eom)\b/i,
  /\bdue\s+(?:by|on|date)\b/i,
  /\bdeadline\s*(?:is|:)/i,
  /\bby\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bby\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
]

/** Financial amount pattern */
const FINANCIAL_PATTERN = /\$\s*[\d,]+\.?\d{0,2}|\b\d[\d,]*\.?\d{0,2}\s*(?:AUD|USD|EUR|GBP)\b/i

/** Action item patterns — questions or requests directed at the reader */
const ACTION_ITEM_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcan\s+you\b[^.?!]*[?]/gi, label: 'request' },
  { pattern: /\bcould\s+you\b[^.?!]*[?]/gi, label: 'request' },
  { pattern: /\bwould\s+you\b[^.?!]*[?]/gi, label: 'request' },
  { pattern: /\bwill\s+you\b[^.?!]*[?]/gi, label: 'request' },
  { pattern: /\bplease\s+\w+/gi, label: 'directive' },
  { pattern: /\bneed\s+(?:you\s+to|your)\b[^.?!]*/gi, label: 'directive' },
  { pattern: /\blet\s+me\s+know\b/gi, label: 'question' },
  { pattern: /\bwhen\s+can\b[^.?!]*[?]/gi, label: 'question' },
  { pattern: /\bare\s+you\s+able\b[^.?!]*/gi, label: 'request' },
  { pattern: /\bconfirm\b[^.?!]*/gi, label: 'directive' },
  { pattern: /\bapprove\b[^.?!]*/gi, label: 'directive' },
  { pattern: /\breview\b[^.?!]*/gi, label: 'directive' },
]

/** Category detection patterns — order matters (first match wins for ambiguous messages) */
const CATEGORY_RULES: Array<{ category: EnrichmentCategory; patterns: RegExp[] }> = [
  {
    category: 'billing',
    patterns: [
      /\binvoice\b/i,
      /\bpayment\b/i,
      /\breceipt\b/i,
      /\bbill(?:ing)?\b/i,
      /\bcharge[sd]?\b/i,
      /\bsubscription\b/i,
      /\brefund\b/i,
      /\btransaction\b/i,
      /\baccount\s+(?:balance|statement)\b/i,
    ],
  },
  {
    category: 'newsletter',
    patterns: [
      /\bunsubscribe\b/i,
      /\bnewsletter\b/i,
      /\bweekly\s+(?:digest|update|roundup)\b/i,
      /\bmonthly\s+(?:digest|update|roundup)\b/i,
      /\bview\s+in\s+browser\b/i,
      /\bemail\s+preferences\b/i,
    ],
  },
  {
    category: 'notification',
    patterns: [
      /\bno-?reply\b/i,
      /\bnotification\b/i,
      /\balert\b/i,
      /\bautomated\s+message\b/i,
      /\bdo\s+not\s+reply\b/i,
      /\bsystem\s+(?:update|notice)\b/i,
    ],
  },
  {
    category: 'client_request',
    patterns: [
      /\bcan\s+you\b/i,
      /\bcould\s+you\b/i,
      /\bplease\s+(?:send|update|provide|check|review|confirm)\b/i,
      /\bneed\s+(?:you\s+to|your\s+help|assistance)\b/i,
      /\bquote\b/i,
      /\bproposal\b/i,
      /\bestimate\b/i,
    ],
  },
  {
    category: 'project_update',
    patterns: [
      /\bupdate\b/i,
      /\bstatus\b/i,
      /\bprogress\b/i,
      /\bmilestone\b/i,
      /\bcompleted?\b/i,
      /\bdeployed?\b/i,
      /\bmerge[sd]?\b/i,
      /\bsprint\b/i,
      /\brelease\b/i,
    ],
  },
  {
    category: 'personal',
    patterns: [
      /\bhappy\s+birthday\b/i,
      /\bcongratulations\b/i,
      /\bcatch\s+up\b/i,
      /\bcoffee\b/i,
      /\blunch\b/i,
      /\bdrinks?\b/i,
      /\bweekend\b/i,
    ],
  },
]

// ─── Enrichment Functions ────────────────────────────────────────────────

/**
 * Generate a one-line summary using Haiku (cheap, fast).
 * Returns empty string on failure — never throws.
 */
async function generateSummary(message: IngestMessage): Promise<string> {
  try {
    const client = new Anthropic()
    const body = message.body.length > MAX_SUMMARY_BODY
      ? message.body.slice(0, MAX_SUMMARY_BODY) + '...[truncated]'
      : message.body

    const prompt = `Summarise this message in exactly ONE sentence (max 120 chars). Be specific — include who, what, and any deadline or amount if present. No preamble.

From: ${message.sender}${message.sender_email ? ` <${message.sender_email}>` : ''}
Subject: ${message.subject ?? '(no subject)'}
Body: ${body}`

    const response = await client.messages.create({
      model: resolveModel('classification'),
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return ''

    // Clean up: remove quotes, trailing periods if the sentence already has punctuation
    return textBlock.text.trim().replace(/^["']|["']$/g, '')
  } catch (err) {
    logger.warn('[ingest-enrichment] Summary generation failed', {
      messageId: message.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return ''
  }
}

/**
 * Score urgency 0-1 using heuristic signals.
 * No LLM — pure regex/keyword analysis.
 */
function scoreUrgency(message: IngestMessage): number {
  const text = [message.subject, message.body].filter(Boolean).join(' ')
  let score = 0

  // Urgency keywords
  for (const { pattern, weight } of URGENCY_KEYWORDS) {
    if (pattern.test(text)) {
      score += weight
    }
  }

  // Deadline mentions (+0.15 each, max 0.3)
  let deadlineHits = 0
  for (const pattern of DEADLINE_PATTERNS) {
    if (pattern.test(text)) {
      deadlineHits++
    }
  }
  score += Math.min(deadlineHits * 0.15, 0.3)

  // Financial amounts (+0.1)
  if (FINANCIAL_PATTERN.test(text)) {
    score += 0.1
  }

  // Question density — many question marks suggest awaiting response (+0.05 per ?, max 0.15)
  const questionMarks = (text.match(/\?/g) || []).length
  score += Math.min(questionMarks * 0.05, 0.15)

  // Known-client sender heuristic: if sender_email has a non-free domain, slight bump
  if (message.sender_email) {
    const domain = message.sender_email.split('@')[1]?.toLowerCase()
    const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'protonmail.com']
    if (domain && !freeProviders.includes(domain)) {
      score += 0.05
    }
  }

  // Clamp to [0, 1]
  return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100
}

/**
 * Extract entity IDs using the existing entity extractor.
 * Returns array of contact IDs for entities that matched known contacts.
 */
async function extractEntityIds(
  supabase: SupabaseClient,
  orgId: string,
  message: IngestMessage,
): Promise<string[]> {
  try {
    const text = [message.subject, message.body].filter(Boolean).join('\n\n')
    const result = await extractEntities(text, orgId, supabase)

    // Collect unique contact IDs from cross-referenced entities
    const contactIds = new Set<string>()
    for (const mention of result.mentions) {
      if (mention.contactId) {
        contactIds.add(mention.contactId)
      }
    }

    return Array.from(contactIds)
  } catch (err) {
    logger.warn('[ingest-enrichment] Entity extraction failed', {
      messageId: message.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Detect action items using regex patterns.
 * Returns deduplicated, trimmed action item strings.
 */
function detectActionItems(message: IngestMessage): string[] {
  const text = [message.subject, message.body].filter(Boolean).join('\n')
  const items: string[] = []
  const seen = new Set<string>()

  for (const { pattern } of ACTION_ITEM_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0
    let match
    // eslint-disable-next-line no-cond-assign
    while ((match = pattern.exec(text)) !== null) {
      const item = match[0].trim()
      // Skip very short matches (likely false positives)
      if (item.length < 8) continue

      // Normalise for dedup
      const normalised = item.toLowerCase().replace(/\s+/g, ' ')
      if (seen.has(normalised)) continue
      seen.add(normalised)

      // Cap individual item length
      items.push(item.length > 200 ? item.slice(0, 200) + '...' : item)
    }
  }

  // Limit to 10 action items max
  return items.slice(0, 10)
}

/**
 * Classify message into a category using keyword patterns.
 * First matching rule wins; defaults to 'notification'.
 */
function classifyCategory(message: IngestMessage): EnrichmentCategory {
  const text = [message.subject, message.body].filter(Boolean).join(' ')

  for (const rule of CATEGORY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        return rule.category
      }
    }
  }

  return 'notification'
}

// ─── Main Export ─────────────────────────────────────────────────────────

/**
 * Enrich a single channel_messages row with summary, urgency, entities,
 * action items, and category. Updates the row's metadata in Supabase.
 *
 * Fire-and-forget safe: never throws. Logs warnings on partial failures
 * and still writes whatever enrichment data succeeded.
 *
 * @param supabase Supabase client instance
 * @param orgId Organisation ID
 * @param message Minimal channel_messages row
 */
export async function enrichMessage(
  supabase: SupabaseClient,
  orgId: string,
  message: IngestMessage,
): Promise<void> {
  try {
    const startTime = performance.now()

    // Run all enrichments concurrently — summary is async (Haiku), rest are sync/fast
    const [summary, entityIds] = await Promise.all([
      generateSummary(message),
      extractEntityIds(supabase, orgId, message),
    ])

    const urgencyScore = scoreUrgency(message)
    const actionItems = detectActionItems(message)
    const category = classifyCategory(message)

    const enrichment: EnrichmentResult = {
      summary,
      urgency_score: urgencyScore,
      entity_ids: entityIds,
      action_items: actionItems,
      enrichment_category: category,
      enriched_at: new Date().toISOString(),
    }

    // Merge with existing metadata (preserve any fields already set)
    const existingMetadata = (message.metadata ?? {}) as Record<string, unknown>
    const mergedMetadata = {
      ...existingMetadata,
      ...enrichment,
    }

    const { error } = await supabase
      .from('channel_messages')
      .update({ metadata: mergedMetadata })
      .eq('id', message.id)

    if (error) {
      logger.warn('[ingest-enrichment] Failed to update message metadata', {
        messageId: message.id,
        error: error.message,
      })
      return
    }

    const elapsed = Math.round(performance.now() - startTime)
    logger.debug('[ingest-enrichment] Enriched message', {
      messageId: message.id,
      urgency: urgencyScore,
      category,
      actionItems: actionItems.length,
      entities: entityIds.length,
      ms: elapsed,
    })
  } catch (err) {
    // Top-level catch — this function must never throw
    logger.warn('[ingest-enrichment] Enrichment failed for message', {
      messageId: message.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
