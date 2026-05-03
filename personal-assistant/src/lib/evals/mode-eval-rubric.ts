/**
 * mode-eval-rubric.ts — Per-mode evaluation rubric.
 *
 * Each dashboard mode (chat / inbox / work / money) has a different idea of
 * "good": chat wants conversational helpfulness, inbox wants triage accuracy,
 * work wants clean task extraction, money wants numeric correctness. A
 * one-rubric-fits-all eval would smother those distinctions.
 *
 * This module is the *measurement primitive*. It defines the dimensions each
 * mode is scored on, plus pure scoring math (no I/O, no LLM calls). The
 * actual eval driver — judge prompts, batch runs, CI integration — lands in
 * follow-up PRs that consume this rubric.
 *
 * "Mode is a prior, not a wall": a chat-mode eval can still score a response
 * on `numeric_correctness` if the rubric authors opt in. The per-mode default
 * dimensions are the prior; the EvalCase carries the actual scored set.
 *
 * NOTE on enforcement scope: this module does not run any model. It defines
 * what is measured and how scores aggregate. Evaluation execution (calling
 * the AI under test, prompting an LLM judge, persisting results) is
 * out-of-scope and lands in follow-up PRs.
 */

import type { Mode } from '@/lib/dashboard/mode-store'

// ─── Dimensions ───────────────────────────────────────────────────────────────

/**
 * Every quality dimension that can appear in a mode-shaped eval. Modes pick
 * their default set; eval cases can expand or contract from there.
 */
export type EvalDimension =
  // chat
  | 'helpfulness'
  | 'conversational_tone'
  // inbox
  | 'triage_accuracy'
  | 'urgency_calibration'
  // work
  | 'task_extraction'
  | 'due_date_inference'
  // money
  | 'numeric_correctness'
  | 'currency_handling'

const ALL_DIMENSIONS: ReadonlyArray<EvalDimension> = [
  'helpfulness',
  'conversational_tone',
  'triage_accuracy',
  'urgency_calibration',
  'task_extraction',
  'due_date_inference',
  'numeric_correctness',
  'currency_handling',
]

const DIMENSION_SET: ReadonlySet<EvalDimension> = new Set(ALL_DIMENSIONS)

export function isEvalDimension(v: string): v is EvalDimension {
  return DIMENSION_SET.has(v as EvalDimension)
}

// ─── Mode → default dimensions ────────────────────────────────────────────────

export interface ModeRubric {
  mode: Mode
  /** Default dimensions scored for this mode. Eval cases can override. */
  dimensions: ReadonlyArray<EvalDimension>
}

export const MODE_RUBRICS: Readonly<Record<Mode, ModeRubric>> = {
  chat: {
    mode: 'chat',
    dimensions: ['helpfulness', 'conversational_tone'],
  },
  inbox: {
    mode: 'inbox',
    dimensions: ['triage_accuracy', 'urgency_calibration'],
  },
  work: {
    mode: 'work',
    dimensions: ['task_extraction', 'due_date_inference'],
  },
  money: {
    mode: 'money',
    dimensions: ['numeric_correctness', 'currency_handling'],
  },
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * 0 = bad, 5 = perfect. Rubric scores are integer-valued in practice but we
 * accept numeric input and round to nearest int defensively at the boundary.
 */
export const MIN_SCORE = 0
export const MAX_SCORE = 5

export interface RubricScore {
  dimension: EvalDimension
  score: number
  evidence?: string
}

export interface ScoreResult {
  /** Sum of valid scores. */
  total: number
  /** 0-100 normalisation. Returns 0 when no dimensions are scored. */
  normalized: number
  /** Dimensions the rubric expected but the caller did not score. */
  missing: EvalDimension[]
  /** Keys the caller passed that are not valid dimensions. Silently ignored. */
  ignored: string[]
}

/**
 * Score a submission against a rubric.
 *
 * - Out-of-range scores are clamped to [MIN_SCORE, MAX_SCORE].
 * - Non-finite values are dropped (treated as missing).
 * - Unknown dimension keys land in `ignored` and contribute nothing.
 * - When the rubric expects no dimensions, returns 0/0 with no error.
 */
export function scoreSubmission(
  rubric: ModeRubric,
  scores: Record<string, number | undefined | null>,
): ScoreResult {
  const expected = rubric.dimensions
  const missing: EvalDimension[] = []
  const ignored: string[] = []
  let total = 0
  let counted = 0

  for (const dim of expected) {
    const raw = scores[dim]
    if (raw == null || !Number.isFinite(raw)) {
      missing.push(dim)
      continue
    }
    const clamped = Math.min(MAX_SCORE, Math.max(MIN_SCORE, raw))
    total += clamped
    counted += 1
  }

  const expectedSet: ReadonlySet<EvalDimension> = new Set(expected)
  for (const key of Object.keys(scores)) {
    if (!isEvalDimension(key) || !expectedSet.has(key)) {
      ignored.push(key)
    }
  }

  const possible = expected.length * MAX_SCORE
  const normalized = possible > 0 && counted > 0 ? Math.round((total / possible) * 100) : 0

  return { total, normalized, missing, ignored }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getRubricForMode(mode: Mode): ModeRubric {
  return MODE_RUBRICS[mode]
}

/** All dimensions known to the registry. Useful for cross-validation. */
export function getAllDimensions(): EvalDimension[] {
  return [...ALL_DIMENSIONS]
}
