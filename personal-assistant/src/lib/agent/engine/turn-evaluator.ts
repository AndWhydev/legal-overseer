/**
 * Per-Turn Quality Evaluator — Sub-project D
 *
 * After each successful TAOR run (medium/high complexity), spawns an async
 * fire-and-forget Haiku call that scores tool efficiency, context utilisation,
 * and confidence calibration. Scores are written back to the agent_runs row.
 *
 * Total cost per evaluation: ~500 input tokens + ~100 output tokens (negligible at Haiku pricing).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { generateText } from 'ai'
import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TurnQualityScore {
  tool_efficiency: number       // 0-1
  context_utilisation: number   // 0-1
  confidence_calibration: number // 0-1
  overall: number               // weighted average
  notes?: string                // optional Haiku commentary (<=50 words)
}

export interface EvaluatorInput {
  run_id: string
  message: string               // user's original message
  tool_calls: string[]          // tool names called (in order)
  plan_stages: number           // how many stages were planned
  surfaced_memory_ids: string[] // from Sub-project B
  response_excerpt: string      // first 500 chars of final response
  iteration_count: number
  model_used: string
  complexity: 'low' | 'medium' | 'high'
}

// ─── Score Validation ───────────────────────────────────────────────────────

function isValidScore(n: unknown): n is number {
  return typeof n === 'number' && !isNaN(n) && n >= 0.0 && n <= 1.0
}

// ─── Evaluator Prompt ───────────────────────────────────────────────────────

function buildEvaluatorPrompt(input: EvaluatorInput): string {
  return `Score this agent turn on three dimensions (0.0-1.0 each):

1. tool_efficiency: Did the agent use the minimum tools needed? Penalize redundant calls, unused results.
2. context_utilisation: Were surfaced memories referenced in the response? Penalize loading context that wasn't used.
3. confidence_calibration: Was the response appropriately assertive? Penalize hedging when results were clear, or asserting when uncertain.

Turn data:
- User message: ${input.message.slice(0, 300)}
- Tools called: ${input.tool_calls.length > 0 ? input.tool_calls.join(', ') : '(none)'}
- Plan stages: ${input.plan_stages}
- Surfaced memory count: ${input.surfaced_memory_ids.length}
- Response excerpt: ${input.response_excerpt.slice(0, 300)}
- Iterations: ${input.iteration_count}

Respond with JSON only: {"tool_efficiency": N, "context_utilisation": N, "confidence_calibration": N, "notes": "brief observation"}`
}

// ─── Main Evaluator ─────────────────────────────────────────────────────────

/**
 * Evaluate a TAOR run's quality via a lightweight Haiku call.
 * Writes scores directly to the agent_runs row. Never throws.
 */
export async function evaluateTurnQuality(
  input: EvaluatorInput,
  supabase: SupabaseClient,
): Promise<TurnQualityScore | null> {
  try {
    const prompt = buildEvaluatorPrompt(input)

    const { text } = await generateText({
      model: models.fast,
      prompt,
      maxOutputTokens: 150,
    })

    // Parse JSON response from Haiku
    const trimmed = text.trim()
    // Extract JSON from potential markdown code fences
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      logger.warn('[turn-evaluator] No JSON found in Haiku response', { run_id: input.run_id })
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Validate all three scores — discard entire evaluation if any is invalid
    if (
      !isValidScore(parsed.tool_efficiency) ||
      !isValidScore(parsed.context_utilisation) ||
      !isValidScore(parsed.confidence_calibration)
    ) {
      logger.warn('[turn-evaluator] Invalid scores from Haiku', {
        run_id: input.run_id,
        parsed,
      })
      return null
    }

    // Edge case: no tool calls means perfect tool efficiency (no tools needed = efficient)
    const toolEfficiency = input.tool_calls.length === 0 ? 1.0 : parsed.tool_efficiency

    // Edge case: no surfaced memories means context_utilisation is N/A
    const contextUtilisation = input.surfaced_memory_ids.length === 0
      ? null
      : parsed.context_utilisation

    const confidenceCalibration = parsed.confidence_calibration

    // Compute overall: weighted average (skip context_utilisation if null)
    let overall: number
    if (contextUtilisation === null) {
      // Reweight: tool_efficiency 0.6, confidence_calibration 0.4
      overall = 0.6 * toolEfficiency + 0.4 * confidenceCalibration
    } else {
      overall = 0.4 * toolEfficiency + 0.35 * contextUtilisation + 0.25 * confidenceCalibration
    }

    const score: TurnQualityScore = {
      tool_efficiency: toolEfficiency,
      context_utilisation: contextUtilisation ?? parsed.context_utilisation,
      confidence_calibration: confidenceCalibration,
      overall,
      notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 200) : undefined,
    }

    // Write scores back to agent_runs
    const { error } = await supabase
      .from('agent_runs')
      .update({
        quality_tool_efficiency: score.tool_efficiency,
        quality_context_utilisation: contextUtilisation,
        quality_confidence_calibration: score.confidence_calibration,
        quality_overall: score.overall,
        quality_notes: score.notes ?? null,
      })
      .eq('id', input.run_id)

    if (error) {
      logger.warn('[turn-evaluator] Failed to write scores', {
        run_id: input.run_id,
        error: error.message,
      })
    } else {
      logger.info('[turn-evaluator] Quality scores recorded', {
        run_id: input.run_id,
        overall: score.overall.toFixed(2),
        tool_efficiency: score.tool_efficiency.toFixed(2),
        complexity: input.complexity,
      })
    }

    return score
  } catch (err) {
    logger.warn('[turn-evaluator] Evaluation failed', {
      run_id: input.run_id,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
