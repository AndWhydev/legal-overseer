/**
 * eval-driver.ts — LLM-as-judge harness for the per-mode eval rubric (#100).
 *
 * Composes three things shipped earlier:
 *   - the rubric primitive (`mode-eval-rubric.ts`) — what to score on
 *   - the seed dataset (`mode-eval-dataset.ts`) — what to evaluate against
 *   - the Anthropic SDK — who scores
 *
 * Foundation only. This module:
 *   - builds a deterministic judge prompt from (rubric, case, modelOutput)
 *   - parses the judge's JSON-shaped reply into RubricScore[]
 *   - exposes a single async helper, judgeSubmission, that wires the SDK
 *     call and the parser together
 *
 * What it does NOT do (carved out for follow-ups):
 *   - run the candidate model itself — caller supplies modelOutput
 *   - batch many cases or persist results — that's the cron-based runner
 *   - CI integration / score-floor gate — separate PR
 *   - production retry/circuit-breaker logic — keep it dumb-and-deterministic
 *
 * Hide the machinery: the judge prompt is JSON-shaped because parsing is
 * cheap and reproducible. Future improvements (CoT scratchpad, self-consistency
 * sampling) can plug in without changing the public API.
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  isEvalDimension,
  scoreSubmission,
  type EvalDimension,
  type ModeRubric,
  type RubricScore,
  type ScoreResult,
} from './mode-eval-rubric'
import type { EvalCase } from './mode-eval-dataset'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * One submission to be judged: a candidate model produced `modelOutput` for
 * the given `caseId`. Persisted in the runner's batch shape later.
 */
export interface EvalSubmission {
  caseId: string
  /** Free-form text the model under test produced. */
  modelOutput: string
  /** Optional candidate-model identifier for traceability. */
  candidateModel?: string
}

/** Result of one judged submission. */
export interface JudgedSubmission {
  caseId: string
  candidateModel?: string
  /** Parsed scores. Missing dimensions show up in `result.missing`. */
  scores: RubricScore[]
  /** Aggregate score derived from `scoreSubmission`. */
  result: ScoreResult
  /** Optional rationale string from the judge for debugging. */
  rationale?: string
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const JUDGE_SYSTEM_PROMPT = [
  'You are an evaluation judge for an AI assistant.',
  'You score one model output at a time on each dimension supplied.',
  'Use the integer scale 0-5 inclusive: 0 = bad, 5 = perfect.',
  'Reply with a single JSON object matching the schema given to you.',
  'Do not include markdown fences, prose preamble, or trailing commentary.',
].join(' ')

/**
 * Build the judge prompt for a single (case, modelOutput) pair scored against
 * a rubric. Output is deterministic for the same inputs — useful for diffing
 * judge runs across model versions.
 */
export function buildLLMJudgePrompt(
  rubric: ModeRubric,
  evalCase: EvalCase,
  modelOutput: string,
): string {
  const dimensions = (evalCase.dimensions.length > 0 ? evalCase.dimensions : rubric.dimensions)
    .map(d => `  - ${d}`)
    .join('\n')

  // The schema doc is inline so a single change updates both the prompt and
  // the parser's expectations together.
  return [
    `Mode: ${rubric.mode}`,
    `Eval case: ${evalCase.id}`,
    '',
    'Input the model received:',
    evalCase.input,
    '',
    'What a correct response looks like:',
    evalCase.expectedBehavior,
    '',
    'Model output:',
    modelOutput,
    '',
    'Score each of these dimensions on the 0-5 scale:',
    dimensions,
    '',
    'Reply with this exact JSON shape:',
    '{',
    '  "scores": [',
    '    { "dimension": "<dimension>", "score": <0-5>, "evidence": "<short>" }',
    '  ],',
    '  "rationale": "<one or two sentence summary>"',
    '}',
  ].join('\n')
}

// ─── Parser ───────────────────────────────────────────────────────────────────

interface JudgeJsonReply {
  scores?: Array<{ dimension?: unknown; score?: unknown; evidence?: unknown }>
  rationale?: unknown
}

export interface ParsedJudgeOutput {
  scores: RubricScore[]
  rationale: string
}

/**
 * Parse the judge's JSON reply into typed RubricScore[]. Tolerates:
 *   - leading/trailing whitespace
 *   - accidental ```json fences (some models still emit them despite the
 *     system prompt — strip and try again rather than fail)
 *   - non-EvalDimension keys (silently dropped; the rubric layer's
 *     `scoreSubmission` will surface missing/ignored separately)
 *   - non-finite or out-of-range scores (clamped at the rubric layer; this
 *     parser only enforces "is a number")
 *
 * Throws TypeError when the reply is not valid JSON or has no scores array.
 */
export function parseLLMJudgeOutput(raw: string): ParsedJudgeOutput {
  const stripped = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: JudgeJsonReply
  try {
    parsed = JSON.parse(stripped) as JudgeJsonReply
  } catch {
    throw new TypeError('eval-driver: judge reply is not valid JSON')
  }

  if (!Array.isArray(parsed.scores)) {
    throw new TypeError('eval-driver: judge reply has no `scores` array')
  }

  const scores: RubricScore[] = []
  for (const entry of parsed.scores) {
    const dim = typeof entry?.dimension === 'string' ? entry.dimension : ''
    const score = typeof entry?.score === 'number' ? entry.score : NaN
    if (!isEvalDimension(dim)) continue
    if (!Number.isFinite(score)) continue
    const evidence = typeof entry?.evidence === 'string' ? entry.evidence : undefined
    scores.push({ dimension: dim as EvalDimension, score, evidence })
  }

  const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : ''
  return { scores, rationale }
}

// ─── Async helper ─────────────────────────────────────────────────────────────

const DEFAULT_JUDGE_MODEL = 'claude-opus-4-20250514'

/**
 * Run one submission through the judge. Caller supplies the Anthropic
 * client (so tests can inject a stub) and the model id (so the judge model
 * stays decoupled from the candidate model).
 *
 * The async surface is deliberately thin: build prompt → SDK call → parse →
 * aggregate. Production-grade retry, rate-limit handling, and observability
 * land in the runner that consumes this helper.
 */
export async function judgeSubmission(
  client: Anthropic,
  rubric: ModeRubric,
  evalCase: EvalCase,
  submission: EvalSubmission,
  judgeModel: string = DEFAULT_JUDGE_MODEL,
): Promise<JudgedSubmission> {
  const prompt = buildLLMJudgePrompt(rubric, evalCase, submission.modelOutput)

  const response = await client.messages.create({
    model: judgeModel,
    max_tokens: 1024,
    system: JUDGE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  const raw = textBlock?.type === 'text' ? textBlock.text : ''
  const { scores, rationale } = parseLLMJudgeOutput(raw)

  // Aggregate via the existing rubric helper so missing/ignored dimensions
  // show up the same way they would for a human-scored submission.
  const submitted: Record<string, number> = {}
  for (const s of scores) submitted[s.dimension] = s.score
  const result = scoreSubmission(rubric, submitted)

  return {
    caseId: evalCase.id,
    candidateModel: submission.candidateModel,
    scores,
    result,
    rationale: rationale || undefined,
  }
}
