/**
 * System 1/2 Query Complexity Gate
 *
 * Classifies incoming queries as System 1 (fast, dossier-only) or System 2
 * (full retrieval). This is the key latency and cost optimisation — 80%+ of
 * queries can be answered from dossiers alone in <50ms instead of 200ms+
 * with 6 retrieval operations.
 *
 * System 1: greetings, confirmations, simple lookups, reminders, simple actions
 * System 2: reasoning, temporal, capacity, aggregation, multi-entity
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type QueryComplexity = 'system1' | 'system2'

export interface ClassifyOptions {
  /** Number of distinct entities mentioned in the query. */
  entityMentionCount?: number
  /** Number of turns so far in this conversation. */
  conversationTurnCount?: number
}

// ─── Pattern Banks ──────────────────────────────────────────────────────────

/**
 * System 1 patterns — cheapest check first.
 * Matches greetings, confirmations, simple lookups, reminders, and simple actions.
 */
const SYSTEM1_PATTERNS: RegExp[] = [
  // Greetings
  /^(hi|hello|hey|thanks|thank you)\b/i,
  /^good\s+(morning|afternoon|evening)\b/i,

  // Confirmations
  /^(yes|no|ok|okay|yep|nope|approved|rejected|cancel)\b/i,

  // Simple lookups: "what's X's email/phone/address/number"
  /\b(email|phone|address|number)\s*\??$/i,

  // Reminders
  /^remind\s+me\b/i,

  // Simple actions: "send/forward/reply it/that/this"
  /^(send|forward|reply)\s+(it|that|this)\b/i,
]

/**
 * System 2 signals — indicate reasoning, temporal depth, or aggregation.
 * A single match is enough to escalate to full retrieval.
 */
const SYSTEM2_SIGNALS: RegExp[] = [
  // Reasoning
  /\b(why|should|analyze|compare|evaluate|assess)\b/i,

  // Temporal
  /\b(history|timeline|full\s+story|everything\s+about|before|after)\b/i,
  /\blast\s+(week|month|year)\b/i,

  // Capacity / trade-offs
  /\b(capacity|budget|afford|priority|trade-off)\b/i,

  // Aggregation
  /\b(all|every|each)\s+(client|project|entity|contact)s?\b/i,
]

// ─── Word count threshold for short-query fast path ─────────────────────────

const SHORT_QUERY_WORD_LIMIT = 10

// ─── Classifier ─────────────────────────────────────────────────────────────

/**
 * Classify a user query as System 1 (fast path) or System 2 (full retrieval).
 *
 * Decision order:
 * 1. entityMentionCount >= 3 → system2 (multi-entity always needs full context)
 * 2. SYSTEM1_PATTERNS match → system1 (cheapest check)
 * 3. SYSTEM2_SIGNALS match (>= 1 hit) → system2
 * 4. Short query (<= 10 words) without complexity signals → system1
 * 5. Default (longer, no clear signals) → system2
 */
export function classifyQueryComplexity(
  query: string,
  opts?: ClassifyOptions,
): QueryComplexity {
  const trimmed = query.trim()

  // 1. Multi-entity queries always need full retrieval
  if (opts?.entityMentionCount !== undefined && opts.entityMentionCount >= 3) {
    return 'system2'
  }

  // 2. Check System 1 patterns (cheapest — regex on short strings)
  if (SYSTEM1_PATTERNS.some((p) => p.test(trimmed))) {
    // But still check if System 2 signals override
    const system2Hits = SYSTEM2_SIGNALS.filter((p) => p.test(trimmed)).length
    if (system2Hits >= 1) {
      return 'system2'
    }
    return 'system1'
  }

  // 3. Check System 2 signals
  const system2Hits = SYSTEM2_SIGNALS.filter((p) => p.test(trimmed)).length
  if (system2Hits >= 1) {
    return 'system2'
  }

  // 4. Short query without complexity signals → system1
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  if (wordCount <= SHORT_QUERY_WORD_LIMIT) {
    return 'system1'
  }

  // 5. Default: longer queries without clear signals → system2 (safer)
  return 'system2'
}

// ─── Escalation Check ───────────────────────────────────────────────────────

/**
 * Determine whether a System 1 classification should be escalated to System 2
 * based on a confidence score. Use this when the dossier-only path produces
 * a low-confidence answer and you want to retry with full retrieval.
 *
 * @param system1Confidence — confidence score from the System 1 response (0-1)
 * @param threshold — minimum confidence to stay on System 1 (default 0.6)
 * @returns true if should escalate to System 2
 */
export function shouldEscalateToSystem2(
  system1Confidence: number,
  threshold: number = 0.6,
): boolean {
  return system1Confidence < threshold
}
