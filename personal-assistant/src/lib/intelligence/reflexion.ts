/**
 * Reflexion Loop — Self-Improvement via Outcome Tracking
 *
 * Implements the Reflexion pattern (NeurIPS 2023) for BitBit:
 * 1. Agent takes an action (sends email, triages message, creates task)
 * 2. Outcome signal arrives (user corrected, approved, or ignored)
 * 3. Agent generates a brief reflection on what it learned
 * 4. Reflection stored in strategy_memories
 * 5. Before similar future actions, relevant reflections are retrieved
 *
 * No fine-tuning required — purely prompt-based learning through memory.
 */

import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

export type OutcomeType = 'corrected' | 'approved' | 'ignored'

export interface ActionOutcomeSignal {
  orgId: string
  domain: string          // 'email_triage', 'task_creation', 'contact_resolution', etc.
  trigger: string         // what prompted the action (e.g., "email from Steve about invoice")
  originalAction: string  // what the agent did
  correction?: string     // what the user changed it to (only for 'corrected')
  outcome: OutcomeType
  sourceActionId?: string // approval_queue ID or agent_run ID
}

export interface StrategyMemory {
  id: string
  domain: string
  trigger: string
  lesson: string
  outcome: OutcomeType
  confidence: number
  timesApplied: number
  lastAppliedAt: string | null
  createdAt: string
}

// ─── Record Outcome ──────────────────────────────────────────────────────────

/**
 * Record an action outcome and generate a strategy memory if the action was corrected.
 * Approved actions strengthen existing strategies. Ignored actions are noted but
 * don't generate new strategies.
 */
export async function recordOutcomeAndReflect(
  supabase: SupabaseClient,
  signal: ActionOutcomeSignal,
): Promise<void> {
  try {
    if (signal.outcome === 'corrected' && signal.correction) {
      // Generate a lesson from the correction
      const lesson = generateLesson(signal)

      // Check for existing similar strategy
      const existing = await findSimilarStrategy(supabase, signal.orgId, signal.domain, lesson)

      if (existing) {
        // Strengthen existing strategy
        await supabase
          .from('strategy_memories')
          .update({
            confidence: Math.min(1.0, existing.confidence + 0.05),
            times_applied: existing.timesApplied + 1,
            last_applied_at: new Date().toISOString(),
          })
          .eq('id', existing.id)

        logger.info('[reflexion] Strengthened existing strategy', {
          domain: signal.domain,
          strategyId: existing.id,
          newConfidence: Math.min(1.0, existing.confidence + 0.05),
        })
      } else {
        // Store new strategy memory
        await supabase
          .from('strategy_memories')
          .insert({
            org_id: signal.orgId,
            domain: signal.domain,
            trigger: signal.trigger,
            lesson,
            outcome: signal.outcome,
            confidence: 0.7, // initial confidence for corrections
            source_action_id: signal.sourceActionId,
          })

        logger.info('[reflexion] Stored new strategy', {
          domain: signal.domain,
          lesson: lesson.slice(0, 80),
        })
      }
    } else if (signal.outcome === 'approved') {
      // Check if there's a strategy that matches this action — boost its confidence
      const strategies = await getRelevantStrategies(supabase, signal.orgId, signal.domain, signal.trigger)
      for (const strategy of strategies) {
        await supabase
          .from('strategy_memories')
          .update({
            confidence: Math.min(1.0, strategy.confidence + 0.02),
            times_applied: strategy.timesApplied + 1,
            last_applied_at: new Date().toISOString(),
          })
          .eq('id', strategy.id)
      }
    }
    // 'ignored' outcomes are not acted on — ambiguous signal
  } catch (err) {
    logger.warn('[reflexion] Failed to record outcome', {
      error: err instanceof Error ? err.message : String(err),
      domain: signal.domain,
    })
  }
}

// ─── Retrieve Strategies ─────────────────────────────────────────────────────

/**
 * Retrieve relevant strategy memories before taking an action.
 * Called by the agent engine to inject learned lessons into context.
 */
export async function getRelevantStrategies(
  supabase: SupabaseClient,
  orgId: string,
  domain: string,
  triggerContext: string,
  limit: number = 3,
): Promise<StrategyMemory[]> {
  try {
    // Get strategies for this domain, ordered by confidence
    const { data } = await supabase
      .from('strategy_memories')
      .select('*')
      .eq('org_id', orgId)
      .eq('domain', domain)
      .gte('confidence', 0.5) // only use strategies we're confident about
      .order('confidence', { ascending: false })
      .limit(limit * 2) // over-fetch for keyword filtering

    if (!data || data.length === 0) return []

    // Score by keyword overlap with the current trigger
    const triggerWords = new Set(triggerContext.toLowerCase().split(/\s+/).filter(w => w.length > 3))

    const scored = data.map(row => {
      const triggerLower = row.trigger.toLowerCase()
      const overlap = [...triggerWords].filter(w => triggerLower.includes(w)).length
      return {
        ...row,
        relevanceScore: overlap / Math.max(triggerWords.size, 1),
      }
    })

    // Sort by relevance then confidence, take top N
    scored.sort((a, b) => {
      const relevanceDiff = b.relevanceScore - a.relevanceScore
      if (Math.abs(relevanceDiff) > 0.1) return relevanceDiff
      return b.confidence - a.confidence
    })

    return scored.slice(0, limit).map(row => ({
      id: row.id,
      domain: row.domain,
      trigger: row.trigger,
      lesson: row.lesson,
      outcome: row.outcome,
      confidence: row.confidence,
      timesApplied: row.times_applied,
      lastAppliedAt: row.last_applied_at,
      createdAt: row.created_at,
    }))
  } catch (err) {
    logger.warn('[reflexion] Failed to retrieve strategies', {
      error: err instanceof Error ? err.message : String(err),
      domain,
    })
    return []
  }
}

/**
 * Format strategy memories as context for injection into the system prompt.
 */
export function formatStrategiesForPrompt(strategies: StrategyMemory[]): string {
  if (strategies.length === 0) return ''

  const lines = strategies.map(s =>
    `- [${s.domain}] ${s.lesson} (confidence: ${Math.round(s.confidence * 100)}%, applied ${s.timesApplied}x)`
  )

  return `## Learned Strategies\nFrom past corrections and feedback:\n${lines.join('\n')}\n`
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Generate a lesson string from a correction signal.
 * Captures what was wrong and what should be done instead.
 */
function generateLesson(signal: ActionOutcomeSignal): string {
  const triggerShort = signal.trigger.length > 100 ? signal.trigger.slice(0, 97) + '...' : signal.trigger
  const originalShort = signal.originalAction.length > 80 ? signal.originalAction.slice(0, 77) + '...' : signal.originalAction
  const correctionShort = signal.correction && signal.correction.length > 80
    ? signal.correction.slice(0, 77) + '...'
    : signal.correction

  return `When "${triggerShort}", I did "${originalShort}" but user changed to "${correctionShort}". Next time, prefer the corrected approach.`
}

/**
 * Find an existing strategy that's similar to the new lesson.
 */
async function findSimilarStrategy(
  supabase: SupabaseClient,
  orgId: string,
  domain: string,
  lesson: string,
): Promise<StrategyMemory | null> {
  try {
    const keywords = lesson.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 3)
    if (keywords.length === 0) return null

    const { data } = await supabase
      .from('strategy_memories')
      .select('*')
      .eq('org_id', orgId)
      .eq('domain', domain)
      .ilike('lesson', `%${keywords[0]}%`)
      .limit(3)

    if (!data || data.length === 0) return null

    // Check for high word overlap
    const lessonWords = new Set(lesson.toLowerCase().split(/\s+/))
    for (const row of data) {
      const rowWords = new Set(row.lesson.toLowerCase().split(/\s+/))
      const intersection = [...lessonWords].filter(w => rowWords.has(w)).length
      const union = new Set([...lessonWords, ...rowWords]).size
      if (union > 0 && intersection / union > 0.5) {
        return {
          id: row.id,
          domain: row.domain,
          trigger: row.trigger,
          lesson: row.lesson,
          outcome: row.outcome,
          confidence: row.confidence,
          timesApplied: row.times_applied,
          lastAppliedAt: row.last_applied_at,
          createdAt: row.created_at,
        }
      }
    }

    return null
  } catch {
    return null
  }
}
