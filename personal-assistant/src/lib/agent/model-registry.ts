/**
 * Purpose-based model resolution.
 *
 * Returns Anthropic model IDs. Override via env vars for AI Gateway routing.
 * Override via env vars: MODEL_CLASSIFY, MODEL_CONVERSE, MODEL_SYNTH
 */

export type ModelPurpose =
  | 'classification'   // fast, cheap: triage, sentiment, parsing
  | 'conversation'     // balanced: chat, comms, general tasks
  | 'synthesis'        // heavy: planning, ad scripts, complex analysis

const MODELS: Record<ModelPurpose, string> = {
  classification: process.env.MODEL_CLASSIFY || 'gemini-2.5-flash',
  conversation:   process.env.MODEL_CONVERSE || 'claude-sonnet-4-5-20250929',
  synthesis:      process.env.MODEL_SYNTH    || 'claude-opus-4-20250514',
}

const TOKEN_LIMITS: Record<ModelPurpose, number> = {
  classification: 4096,
  conversation:   8192,
  synthesis:      16384,
}

const COST_PER_MILLION: Record<ModelPurpose, { input: number; output: number }> = {
  classification: { input: 0.15,  output: 0.60  }, // Gemini 2.5 Flash
  conversation:   { input: 3.00,  output: 15.00 },
  synthesis:      { input: 15.00, output: 75.00 },
}

export function resolveModel(purpose: ModelPurpose): string {
  return MODELS[purpose]
}

export function resolveTokenLimit(purpose: ModelPurpose): number {
  return TOKEN_LIMITS[purpose]
}

export function computeCost(purpose: ModelPurpose, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_MILLION[purpose]
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000
}

export function classifyPurpose(task: string, wordCount?: number): ModelPurpose {
  const lower = task.toLowerCase()
  const heavySignals = ['plan', 'strateg', 'complex', 'analy', 'script', 'synthe']
  const lightSignals = ['classif', 'triage', 'sentiment', 'extract', 'parse', 'label']

  if (lightSignals.some(s => lower.includes(s))) return 'classification'
  if (heavySignals.some(s => lower.includes(s))) return 'synthesis'
  if (wordCount && wordCount > 2000) return 'synthesis'
  return 'conversation'
}
