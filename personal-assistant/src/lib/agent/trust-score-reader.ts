/**
 * Trust Score Reader — reads historical execution data to inform autonomy gating.
 *
 * Trust scores are written to the database on every agent run via:
 *   - action_outcomes (confidence-calibrator.ts) — per-agent, per-action outcomes
 *   - execution_reliability (reliability-tracker.ts) — per-service, per-tier outcomes
 *
 * This module reads them back to produce a composite trust signal that feeds into
 * the confidence router. Without this, autonomy gating is theater — decisions are
 * made without consulting the agent's track record.
 *
 * Design principles (match existing codebase patterns):
 *   - Never throws — returns safe defaults on any error (fail-open)
 *   - Fire-and-forget compatible: callers can await or not
 *   - Graceful degradation: insufficient data → neutral trust (no adjustment)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrustScore {
  /** Composite trust score 0–1 (0 = no trust, 1 = full trust) */
  score: number
  /** Number of outcomes considered */
  sampleSize: number
  /** Whether the sample is large enough to be meaningful */
  sufficient: boolean
  /** Success streak — consecutive recent successes (for tier promotion) */
  streak: number
  /** Recommended gate decision based on trust thresholds */
  gate: 'allow' | 'require_approval' | 'block'
  /** Human-readable reasoning */
  reasoning: string
}

export interface TrustScoreQuery {
  orgId: string
  /** Tool/action name (per-skill trust) */
  actionType?: string
  /** Agent type (e.g. 'invoice-flow', 'lead-swarm') */
  agentType?: string
  /** Entity ID (per-entity trust) */
  entityId?: string
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Minimum outcomes needed before trust scores influence gating */
export const MIN_TRUST_SAMPLES = 5

/** Trust score below this → require HITL approval */
export const TRUST_APPROVAL_THRESHOLD = 0.6

/** Trust score below this → block execution entirely */
export const TRUST_BLOCK_THRESHOLD = 0.3

/** Consecutive successes needed for tier promotion eligibility */
export const PROMOTION_STREAK_THRESHOLD = 10

/** Default neutral trust score when insufficient data */
export const NEUTRAL_TRUST: TrustScore = {
  score: 1.0,
  sampleSize: 0,
  sufficient: false,
  streak: 0,
  gate: 'allow',
  reasoning: 'Insufficient data — defaulting to neutral trust (no restriction)',
}

// ---------------------------------------------------------------------------
// Per-Skill Trust Score
// ---------------------------------------------------------------------------

/**
 * Look up the per-skill trust score from action_outcomes.
 *
 * Queries the last 30 days of outcomes for the given org + agent type + action type.
 * Returns a composite score based on the approval rate and success streak.
 *
 * Returns NEUTRAL_TRUST on any error or insufficient data.
 */
export async function getSkillTrustScore(
  supabase: SupabaseClient,
  query: TrustScoreQuery,
): Promise<TrustScore> {
  if (!query.actionType) return { ...NEUTRAL_TRUST }

  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    let q = supabase
      .from('action_outcomes')
      .select('was_approved, was_correct, confidence_score, created_at')
      .eq('org_id', query.orgId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .eq('action_type', query.actionType)

    if (query.agentType) {
      q = q.eq('agent_type', query.agentType)
    }

    const { data, error } = await q
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      logger.warn('[trust-score-reader] Failed to query skill trust score', {
        error: error.message,
        actionType: query.actionType,
        orgId: query.orgId,
      })
      return { ...NEUTRAL_TRUST }
    }

    if (!data || data.length < MIN_TRUST_SAMPLES) {
      return {
        ...NEUTRAL_TRUST,
        sampleSize: data?.length ?? 0,
        reasoning: `Only ${data?.length ?? 0}/${MIN_TRUST_SAMPLES} samples for "${query.actionType}" — defaulting to neutral trust`,
      }
    }

    return computeTrustFromOutcomes(data, query.actionType)
  } catch (err) {
    logger.warn('[trust-score-reader] Unexpected error querying skill trust', {
      error: err instanceof Error ? err.message : String(err),
      actionType: query.actionType,
    })
    return { ...NEUTRAL_TRUST }
  }
}

// ---------------------------------------------------------------------------
// Per-Entity Trust Score
// ---------------------------------------------------------------------------

/**
 * Look up the per-entity trust score from execution_reliability.
 *
 * Queries the reliability summary view for the entity's org, filtered to
 * the specific service/tool. For entity-level trust, we look at the overall
 * success rate across all tools used in that entity's context.
 *
 * Returns NEUTRAL_TRUST on any error or insufficient data.
 */
export async function getEntityTrustScore(
  supabase: SupabaseClient,
  query: TrustScoreQuery,
): Promise<TrustScore> {
  if (!query.entityId) return { ...NEUTRAL_TRUST }

  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Query action_outcomes scoped to this entity (via metadata or entity_id column if present)
    // The action_outcomes table tracks outcomes per org+agent+action; for per-entity,
    // we use the delegation_action_log which is per-entity.
    const { data, error } = await supabase
      .from('delegation_action_log')
      .select('action_type, financial_impact, created_at')
      .eq('org_id', query.orgId)
      .eq('entity_id', query.entityId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      logger.warn('[trust-score-reader] Failed to query entity trust score', {
        error: error.message,
        entityId: query.entityId,
        orgId: query.orgId,
      })
      return { ...NEUTRAL_TRUST }
    }

    if (!data || data.length < MIN_TRUST_SAMPLES) {
      return {
        ...NEUTRAL_TRUST,
        sampleSize: data?.length ?? 0,
        reasoning: `Only ${data?.length ?? 0}/${MIN_TRUST_SAMPLES} entity actions for "${query.entityId}" — defaulting to neutral trust`,
      }
    }

    // For entity trust, having a history of delegated actions is a positive signal.
    // The score is based on volume + recency (more recent actions = more trust).
    const score = Math.min(1.0, data.length / 20) // scales linearly up to 20 actions
    const gate = deriveGate(score)

    return {
      score,
      sampleSize: data.length,
      sufficient: true,
      streak: data.length, // delegation actions are inherently "successful"
      gate,
      reasoning: `Entity has ${data.length} delegated actions in 30 days — trust ${score.toFixed(2)} → ${gate}`,
    }
  } catch (err) {
    logger.warn('[trust-score-reader] Unexpected error querying entity trust', {
      error: err instanceof Error ? err.message : String(err),
      entityId: query.entityId,
    })
    return { ...NEUTRAL_TRUST }
  }
}

// ---------------------------------------------------------------------------
// Composite Trust Score
// ---------------------------------------------------------------------------

/**
 * Compute a composite trust score combining per-skill and per-entity signals.
 *
 * The composite takes the minimum of both scores (conservative approach):
 * if either the skill or the entity has low trust, gating is tightened.
 *
 * When only one dimension has sufficient data, that score is used alone.
 */
export async function getCompositeTrustScore(
  supabase: SupabaseClient,
  query: TrustScoreQuery,
): Promise<TrustScore> {
  const [skill, entity] = await Promise.all([
    getSkillTrustScore(supabase, query),
    getEntityTrustScore(supabase, query),
  ])

  // If neither has sufficient data, return neutral
  if (!skill.sufficient && !entity.sufficient) {
    return {
      ...NEUTRAL_TRUST,
      reasoning: 'Neither skill nor entity has sufficient trust data — neutral trust',
    }
  }

  // If only one has data, use that
  if (!skill.sufficient) return entity
  if (!entity.sufficient) return skill

  // Both have data: take the minimum (conservative)
  const minScore = Math.min(skill.score, entity.score)
  const gate = deriveGate(minScore)
  const minStreak = Math.min(skill.streak, entity.streak)

  return {
    score: minScore,
    sampleSize: skill.sampleSize + entity.sampleSize,
    sufficient: true,
    streak: minStreak,
    gate,
    reasoning: `Composite trust: skill=${skill.score.toFixed(2)} (n=${skill.sampleSize}), entity=${entity.score.toFixed(2)} (n=${entity.sampleSize}) → min=${minScore.toFixed(2)} → ${gate}`,
  }
}

// ---------------------------------------------------------------------------
// Trust-Aware Confidence Adjustment
// ---------------------------------------------------------------------------

/**
 * Adjust an agent's confidence score based on trust history.
 *
 * When trust is high (>= 0.8) and the agent has a promotion-eligible streak,
 * the confidence is boosted slightly (max +0.05) to help cross the act threshold.
 *
 * When trust is low (< TRUST_APPROVAL_THRESHOLD), confidence is penalised
 * to push the decision toward the approval queue.
 *
 * When trust data is insufficient, confidence is returned unchanged.
 */
export function adjustConfidenceByTrust(
  confidence: number,
  trust: TrustScore,
): { adjusted: number; reason: string } {
  if (!trust.sufficient) {
    return {
      adjusted: confidence,
      reason: 'Trust data insufficient — confidence unchanged',
    }
  }

  // High trust + long streak → slight confidence boost
  if (trust.score >= 0.8 && trust.streak >= PROMOTION_STREAK_THRESHOLD) {
    const boost = Math.min(0.05, (trust.streak - PROMOTION_STREAK_THRESHOLD) * 0.005)
    const adjusted = Math.min(1.0, confidence + boost)
    return {
      adjusted,
      reason: `Trust ${trust.score.toFixed(2)} with ${trust.streak}-streak → boosted confidence by ${boost.toFixed(3)} (${confidence.toFixed(3)} → ${adjusted.toFixed(3)})`,
    }
  }

  // Low trust → penalise confidence
  if (trust.score < TRUST_APPROVAL_THRESHOLD) {
    const penalty = (TRUST_APPROVAL_THRESHOLD - trust.score) * 0.15
    const adjusted = Math.max(0, confidence - penalty)
    return {
      adjusted,
      reason: `Low trust ${trust.score.toFixed(2)} → penalised confidence by ${penalty.toFixed(3)} (${confidence.toFixed(3)} → ${adjusted.toFixed(3)})`,
    }
  }

  // Normal trust — no adjustment
  return {
    adjusted: confidence,
    reason: `Trust ${trust.score.toFixed(2)} in normal range — confidence unchanged`,
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Compute trust score from a set of action outcomes.
 * Exported for testing.
 */
export function computeTrustFromOutcomes(
  outcomes: Array<{
    was_approved: boolean
    was_correct?: boolean | null
    confidence_score?: number
    created_at?: string
  }>,
  label: string,
): TrustScore {
  if (outcomes.length === 0) return { ...NEUTRAL_TRUST }

  // Approval rate is the primary signal
  const approved = outcomes.filter(o => o.was_approved).length
  const approvalRate = approved / outcomes.length

  // Correctness rate (when available) is a secondary signal
  const withCorrectness = outcomes.filter(o => o.was_correct !== null && o.was_correct !== undefined)
  const correctRate = withCorrectness.length > 0
    ? withCorrectness.filter(o => o.was_correct).length / withCorrectness.length
    : null

  // Composite: weighted blend of approval rate and correctness
  // If correctness data exists, it accounts for 40% of the score
  const score = correctRate !== null
    ? approvalRate * 0.6 + correctRate * 0.4
    : approvalRate

  // Calculate success streak (consecutive recent approvals)
  let streak = 0
  for (const o of outcomes) {
    if (o.was_approved) {
      streak++
    } else {
      break
    }
  }

  const sufficient = outcomes.length >= MIN_TRUST_SAMPLES
  const gate = sufficient ? deriveGate(score) : 'allow'

  return {
    score,
    sampleSize: outcomes.length,
    sufficient,
    streak,
    gate,
    reasoning: `"${label}": ${approved}/${outcomes.length} approved (${(approvalRate * 100).toFixed(0)}%)${
      correctRate !== null ? `, ${(correctRate * 100).toFixed(0)}% correct` : ''
    }, streak=${streak} → trust ${score.toFixed(2)} → ${gate}`,
  }
}

/** Derive gate decision from a trust score. */
function deriveGate(score: number): TrustScore['gate'] {
  if (score < TRUST_BLOCK_THRESHOLD) return 'block'
  if (score < TRUST_APPROVAL_THRESHOLD) return 'require_approval'
  return 'allow'
}
