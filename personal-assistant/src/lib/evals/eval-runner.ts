/**
 * eval-runner.ts — Batch eval runner.
 *
 * Walks the seed dataset (filtered by mode if requested), invokes a caller-
 * supplied `candidateRunner` to produce a model output for each case, and
 * judges every result with the LLM-as-judge helper from #111. Returns the
 * raw `JudgedSubmission[]` plus a per-mode + overall mean score so a CI
 * gate can decide pass/fail without re-aggregating.
 *
 * Foundation only:
 *   - Caller supplies the `candidateRunner` (no built-in "run production
 *     model on all 4 modes" yet — that lands when the cron route wires it)
 *   - No persistence to Supabase; `JudgedSubmission[]` is returned to the
 *     caller. Persistence is a separate follow-up.
 *   - No retries / circuit-breaker / rate limit handling — the runner is
 *     deliberately dumb. The caller decides whether one bad judgment
 *     poisons the batch (default: surface in `errors`, keep going).
 *   - The Next.js API route at `/api/cron/eval-run` only accepts a stub
 *     candidate runner today. Real candidate wiring is a separate PR.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { Mode } from '@/lib/dashboard/mode-store'
import { MODE_RUBRICS, type ModeRubric } from './mode-eval-rubric'
import { SEED_DATASET, type EvalCase } from './mode-eval-dataset'
import {
  judgeSubmission,
  type EvalSubmission,
  type JudgedSubmission,
} from './eval-driver'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Caller-supplied function that runs the model under test for a single case
 * and returns the raw text the model produced. Sync or async.
 *
 * Errors thrown here are caught by the runner and recorded in `errors`;
 * other cases keep going. This is intentional — one flaky candidate run
 * shouldn't poison a 50-case batch.
 */
export type CandidateRunner = (evalCase: EvalCase) => string | Promise<string>

export interface RunEvalBatchOptions {
  /** Filter cases to a single mode. Omit to evaluate all four. */
  mode?: Mode
  /** Override judge model — defaults to whatever judgeSubmission picks. */
  judgeModel?: string
  /** Stable id for this run. Used for traceability when persisted later. */
  runId?: string
  /** Optional candidate-model id stored on every JudgedSubmission. */
  candidateModel?: string
}

export interface EvalRunReport {
  runId: string
  startedAt: string
  finishedAt: string
  /** All judged cases, in dataset order. */
  results: JudgedSubmission[]
  /** Cases the candidate or judge errored on. */
  errors: Array<{ caseId: string; phase: 'candidate' | 'judge'; message: string }>
  /** Mean normalised score across everything in `results`. 0 when empty. */
  overallMean: number
  /** Mean normalised score per mode. Modes with zero results are omitted. */
  byMode: Partial<Record<Mode, { count: number; mean: number }>>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rubricFor(mode: Mode): ModeRubric {
  return MODE_RUBRICS[mode]
}

function makeRunId(): string {
  // Avoid pulling in crypto.randomUUID for runtime portability — a
  // timestamp + random suffix is enough for traceability.
  return `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function aggregate(results: JudgedSubmission[], pickMode: (id: string) => Mode | undefined): {
  overallMean: number
  byMode: Partial<Record<Mode, { count: number; mean: number }>>
} {
  if (results.length === 0) return { overallMean: 0, byMode: {} }

  const buckets: Partial<Record<Mode, number[]>> = {}
  let total = 0
  for (const r of results) {
    total += r.result.normalized
    const mode = pickMode(r.caseId)
    if (mode) {
      ;(buckets[mode] ?? (buckets[mode] = [])).push(r.result.normalized)
    }
  }

  const byMode: Partial<Record<Mode, { count: number; mean: number }>> = {}
  for (const [mode, scores] of Object.entries(buckets)) {
    const arr = scores as number[]
    byMode[mode as Mode] = {
      count: arr.length,
      mean: Math.round(arr.reduce((s, n) => s + n, 0) / arr.length),
    }
  }

  return { overallMean: Math.round(total / results.length), byMode }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the candidate against every case in the dataset (filtered by mode if
 * given) and judge each result. Returns a structured report — never throws
 * for individual case failures; those land in `errors`.
 *
 * Throws only when the global precondition is wrong (no candidateRunner,
 * unknown mode, etc.).
 */
export async function runEvalBatch(
  client: Anthropic,
  candidate: CandidateRunner,
  options: RunEvalBatchOptions = {},
): Promise<EvalRunReport> {
  const startedAt = new Date().toISOString()
  const runId = options.runId ?? makeRunId()

  const cases: ReadonlyArray<EvalCase> = options.mode
    ? SEED_DATASET.filter(c => c.mode === options.mode)
    : SEED_DATASET

  const results: JudgedSubmission[] = []
  const errors: EvalRunReport['errors'] = []

  for (const evalCase of cases) {
    let modelOutput: string
    try {
      modelOutput = await candidate(evalCase)
    } catch (err) {
      errors.push({
        caseId: evalCase.id,
        phase: 'candidate',
        message: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    const submission: EvalSubmission = {
      caseId: evalCase.id,
      modelOutput,
      candidateModel: options.candidateModel,
    }

    try {
      const judged = await judgeSubmission(
        client,
        rubricFor(evalCase.mode),
        evalCase,
        submission,
        options.judgeModel,
      )
      results.push(judged)
    } catch (err) {
      errors.push({
        caseId: evalCase.id,
        phase: 'judge',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const caseModeIndex = new Map<string, Mode>(SEED_DATASET.map(c => [c.id, c.mode]))
  const { overallMean, byMode } = aggregate(results, id => caseModeIndex.get(id))

  return {
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    results,
    errors,
    overallMean,
    byMode,
  }
}
