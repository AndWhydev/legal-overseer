/**
 * Memory Admission Control (A-MAC inspired)
 *
 * Scores candidate memories on 5 factors before storing them.
 * Prevents memory pollution by rejecting low-value, redundant,
 * or low-confidence facts before they enter semantic_memories.
 *
 * Factors:
 * 1. Future utility — will this be needed again?
 * 2. Factual confidence — is this actually true?
 * 3. Semantic novelty — do we already know this?
 * 4. Temporal recency — how old is this?
 * 5. Content type prior — facts > opinions > ephemera
 *
 * Returns a composite score 0-1 and a typed decay rate.
 * Memories below the admission threshold are rejected.
 */

import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AdmissionCandidate {
  content: string
  category: string
  confidence: number
  entityIds?: string[]
  source: string // 'reflection_agent', 'consolidation', 'conversation_extraction', 'user_explicit'
  extractedAt?: string // ISO timestamp of when the underlying event occurred
}

export interface AdmissionResult {
  admitted: boolean
  score: number
  decayRate: 'slow' | 'normal' | 'fast' | 'never'
  reasoning: string
  factors: {
    futureUtility: number
    factualConfidence: number
    semanticNovelty: number
    temporalRecency: number
    contentTypePrior: number
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum composite score to admit a memory */
const ADMISSION_THRESHOLD = 0.35

/** Weight per factor in the composite score */
const WEIGHTS = {
  futureUtility: 0.25,
  factualConfidence: 0.20,
  semanticNovelty: 0.25,
  temporalRecency: 0.10,
  contentTypePrior: 0.20,
}

/** Content type priors — how valuable different categories of information are */
const CATEGORY_PRIORS: Record<string, number> = {
  financial: 1.0,        // money amounts, payment terms, invoice details
  relationship: 0.85,    // who knows who, org structures
  preference: 0.80,      // user preferences, communication styles
  procedural: 0.75,      // how to do things, workflows
  factual: 0.70,         // objective facts about entities
  behavioral: 0.65,      // patterns of behavior
  general: 0.40,         // general knowledge, opinions
}

/** Decay rates by category — how quickly different types of memories lose relevance */
const DECAY_RATES: Record<string, 'slow' | 'normal' | 'fast' | 'never'> = {
  preference: 'slow',       // user preferences persist for months
  relationship: 'slow',     // relationship facts are durable
  financial: 'normal',      // financial facts change per quarter
  procedural: 'slow',       // workflows don't change often
  factual: 'normal',        // facts about entities update regularly
  behavioral: 'normal',     // patterns evolve over weeks
  general: 'fast',          // general observations fade quickly
}

/** User-explicit memories (via add_memory tool) never decay */
const EXPLICIT_SOURCES = new Set(['user_explicit'])

// ─── Scoring Functions ──────────────────────────────────────────────────────

/**
 * Score future utility: will this fact be useful in future conversations?
 * High-value signals: names, amounts, dates, commitments, preferences.
 * Low-value signals: greetings, acknowledgments, ephemeral status.
 */
function scoreFutureUtility(candidate: AdmissionCandidate): number {
  const content = candidate.content.toLowerCase()

  // High utility patterns
  const highSignals = [
    /\$[\d,]+/,                          // dollar amounts
    /\d+%/,                              // percentages
    /deadline|due date|due by/,          // deadlines
    /prefers?|always|never|likes?/,      // preferences
    /relationship|works? (?:with|for|at)/, // relationships
    /contact|email|phone|address/,       // contact info
    /invoice|payment|billing/,           // financial
    /project|contract|agreement/,        // business entities
    /committed|promised|agreed/,         // commitments
  ]

  const lowSignals = [
    /^(?:ok|thanks|sure|got it|sounds good)/,  // acknowledgments
    /weather|traffic|lunch/,                     // ephemeral
    /^(?:hello|hi|hey|good morning)/,           // greetings
  ]

  let score = 0.5 // baseline

  for (const pattern of highSignals) {
    if (pattern.test(content)) score += 0.08
  }

  for (const pattern of lowSignals) {
    if (pattern.test(content)) score -= 0.15
  }

  // Entity linkage boosts utility (facts about known entities are more useful)
  if (candidate.entityIds && candidate.entityIds.length > 0) {
    score += 0.1
  }

  return Math.max(0, Math.min(1, score))
}

/**
 * Score factual confidence: is this actually true?
 * Uses the candidate's extraction confidence + source reliability.
 */
function scoreFactualConfidence(candidate: AdmissionCandidate): number {
  let score = candidate.confidence

  // User-explicit memories are always high confidence
  if (EXPLICIT_SOURCES.has(candidate.source)) {
    score = Math.max(score, 0.95)
  }

  // Reflection agent extractions are slightly less reliable
  if (candidate.source === 'reflection_agent') {
    score *= 0.9
  }

  return Math.max(0, Math.min(1, score))
}

/**
 * Score semantic novelty: do we already know this?
 * Checks existing semantic_memories for similar content.
 */
async function scoreSemanticNovelty(
  supabase: SupabaseClient,
  orgId: string,
  candidate: AdmissionCandidate,
): Promise<number> {
  try {
    // Check for similar existing memories
    const keywords = candidate.content
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)
      .slice(0, 3)

    if (keywords.length === 0) return 0.8 // short content is likely novel

    // Search for any existing memory containing the same keywords
    let query = supabase
      .from('semantic_memories')
      .select('content')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .limit(5)

    // Use the first keyword for an ilike search
    query = query.ilike('content', `%${keywords[0]}%`)

    const { data } = await query

    if (!data || data.length === 0) return 1.0 // fully novel

    // Check for high overlap
    const candidateWords = new Set(candidate.content.toLowerCase().split(/\s+/))
    let maxOverlap = 0

    for (const existing of data) {
      const existingWords = new Set(existing.content.toLowerCase().split(/\s+/))
      const intersection = [...candidateWords].filter(w => existingWords.has(w)).length
      const union = new Set([...candidateWords, ...existingWords]).size
      const jaccard = union > 0 ? intersection / union : 0
      maxOverlap = Math.max(maxOverlap, jaccard)
    }

    // High overlap = low novelty
    return Math.max(0, 1 - maxOverlap)
  } catch {
    return 0.7 // assume somewhat novel on error
  }
}

/**
 * Score temporal recency: is this information fresh?
 */
function scoreTemporalRecency(candidate: AdmissionCandidate): number {
  if (!candidate.extractedAt) return 0.8 // assume recent if no timestamp

  const ageMs = Date.now() - new Date(candidate.extractedAt).getTime()
  const ageHours = ageMs / (1000 * 60 * 60)

  if (ageHours < 1) return 1.0
  if (ageHours < 24) return 0.9
  if (ageHours < 168) return 0.7  // 1 week
  if (ageHours < 720) return 0.5  // 30 days
  return 0.3
}

/**
 * Score content type prior: how valuable is this category of information?
 */
function scoreContentTypePrior(candidate: AdmissionCandidate): number {
  return CATEGORY_PRIORS[candidate.category] ?? 0.5
}

// ─── Main Admission Function ─────────────────────────────────────────────────

/**
 * Evaluate a candidate memory for admission.
 * Returns whether to store it, the composite score, and the decay rate.
 */
export async function evaluateAdmission(
  supabase: SupabaseClient,
  orgId: string,
  candidate: AdmissionCandidate,
): Promise<AdmissionResult> {
  const factors = {
    futureUtility: scoreFutureUtility(candidate),
    factualConfidence: scoreFactualConfidence(candidate),
    semanticNovelty: await scoreSemanticNovelty(supabase, orgId, candidate),
    temporalRecency: scoreTemporalRecency(candidate),
    contentTypePrior: scoreContentTypePrior(candidate),
  }

  const score =
    factors.futureUtility * WEIGHTS.futureUtility +
    factors.factualConfidence * WEIGHTS.factualConfidence +
    factors.semanticNovelty * WEIGHTS.semanticNovelty +
    factors.temporalRecency * WEIGHTS.temporalRecency +
    factors.contentTypePrior * WEIGHTS.contentTypePrior

  const admitted = score >= ADMISSION_THRESHOLD

  // Determine decay rate
  let decayRate = DECAY_RATES[candidate.category] ?? 'normal'
  if (EXPLICIT_SOURCES.has(candidate.source)) {
    decayRate = 'never' // user-explicit memories don't decay
  }

  const reasoning = admitted
    ? `Admitted (score ${score.toFixed(2)}): utility=${factors.futureUtility.toFixed(2)}, confidence=${factors.factualConfidence.toFixed(2)}, novelty=${factors.semanticNovelty.toFixed(2)}`
    : `Rejected (score ${score.toFixed(2)} < ${ADMISSION_THRESHOLD}): ${
        factors.semanticNovelty < 0.3 ? 'redundant' :
        factors.futureUtility < 0.3 ? 'low utility' :
        factors.factualConfidence < 0.3 ? 'low confidence' :
        'below threshold'
      }`

  if (!admitted) {
    logger.debug('[memory-admission] Rejected candidate', {
      orgId,
      score: score.toFixed(2),
      category: candidate.category,
      contentPreview: candidate.content.slice(0, 50),
      factors,
    })
  }

  return { admitted, score, decayRate, reasoning, factors }
}
