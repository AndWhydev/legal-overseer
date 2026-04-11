/**
 * Predictive Coding Engine — Free Energy Principle implementation.
 *
 * Scores incoming facts against entity schemas for surprise, tracks
 * prediction errors, and evolves schemas when errors accumulate.
 *
 * ~80% of messages are "as expected" (score < SURPRISE_THRESHOLD) and
 * skip memory creation, dramatically reducing storage and improving
 * signal-to-noise in entity dossiers.
 */

import { gateway, generateText } from 'ai'

import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import type { KnowledgeLogEntry, SurpriseScore } from './types'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Below this score a fact is considered "expected" — skip memory creation. */
export const SURPRISE_THRESHOLD = 0.3

/** Number of same-type prediction errors needed before triggering a schema update. */
export const SCHEMA_UPDATE_THRESHOLD = 3

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_DEVIATION_TYPES = new Set([
  'contradicts_schema',
  'novel_dimension',
  'magnitude_shift',
  'expected',
])

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isEmptySchema(schema: Record<string, unknown> | null | undefined): boolean {
  return !schema || Object.keys(schema).length === 0
}

// ─── scoreSurprise ──────────────────────────────────────────────────────────

/**
 * Score how surprising a fact is relative to an entity's current schema.
 *
 * Empty/null schemas always return { score: 0.5, deviation_type: 'novel_dimension' }
 * since everything is new when there's no prior model.
 *
 * Non-empty schemas are evaluated by the fast LLM (Gemini Flash) which
 * compares the fact against known patterns.
 */
export async function scoreSurprise(
  fact: KnowledgeLogEntry,
  schema: Record<string, unknown>,
): Promise<SurpriseScore> {
  const fallback: SurpriseScore = {
    fact_id: fact.id,
    score: 0.5,
    deviation_type: 'novel_dimension',
  }

  if (isEmptySchema(schema)) {
    return fallback
  }

  try {
    const { text } = await generateText({
      model: gateway(models.fast),
      system: `You are a prediction-error detector. Compare the incoming fact against the entity schema and output ONE JSON line:
{"score": <0.0-1.0>, "deviation_type": "<contradicts_schema|novel_dimension|magnitude_shift|expected>", "reason": "<brief explanation>"}

Scoring guide:
- 0.0 = perfectly expected given the schema
- 0.3 = mildly surprising but within normal variation
- 0.5 = moderately surprising, new information
- 0.7 = significantly deviates from established patterns
- 1.0 = directly contradicts the schema

Output ONLY the JSON line, no other text.`,
      prompt: `Entity schema:\n${JSON.stringify(schema, null, 2)}\n\nIncoming fact:\n${fact.content}`,
    })

    const parsed = JSON.parse(text.trim())
    const score = typeof parsed.score === 'number' ? clamp(parsed.score, 0, 1) : 0.5
    const deviationType = VALID_DEVIATION_TYPES.has(parsed.deviation_type)
      ? (parsed.deviation_type as SurpriseScore['deviation_type'])
      : 'novel_dimension'

    return { fact_id: fact.id, score, deviation_type: deviationType }
  } catch (err) {
    logger.warn('predictive-coding: scoreSurprise failed, using fallback', {
      fact_id: fact.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return fallback
  }
}

// ─── shouldUpdateSchema ─────────────────────────────────────────────────────

/**
 * Determine whether accumulated prediction errors warrant a schema update.
 *
 * Filters to errors above SURPRISE_THRESHOLD, groups by deviation_type,
 * and returns true if any single type has >= threshold occurrences.
 */
export function shouldUpdateSchema(
  errors: SurpriseScore[],
  threshold: number = SCHEMA_UPDATE_THRESHOLD,
): boolean {
  const significant = errors.filter((e) => e.score >= SURPRISE_THRESHOLD)
  if (significant.length === 0) return false

  const counts = new Map<string, number>()
  for (const error of significant) {
    const count = (counts.get(error.deviation_type) ?? 0) + 1
    counts.set(error.deviation_type, count)
    if (count >= threshold) return true
  }

  return false
}

// ─── updateSchemaFromErrors ─────────────────────────────────────────────────

/**
 * Evolve an entity schema by incorporating accumulated prediction errors.
 *
 * Only processes errors above SURPRISE_THRESHOLD. Asks the fast LLM to
 * produce an updated JSON schema that accounts for the new evidence.
 *
 * Returns currentSchema unchanged on failure (parse error, API error,
 * or no significant errors).
 */
export async function updateSchemaFromErrors(
  currentSchema: Record<string, unknown>,
  errors: SurpriseScore[],
  facts: KnowledgeLogEntry[],
): Promise<Record<string, unknown>> {
  const significant = errors.filter((e) => e.score >= SURPRISE_THRESHOLD)
  if (significant.length === 0) return currentSchema

  // Build a fact lookup for the error fact_ids
  const factMap = new Map(facts.map((f) => [f.id, f]))
  const errorFacts = significant
    .map((e) => {
      const fact = factMap.get(e.fact_id)
      return fact
        ? `- [${e.deviation_type}, score=${e.score}] ${fact.content}`
        : `- [${e.deviation_type}, score=${e.score}] (fact content unavailable)`
    })
    .join('\n')

  try {
    const { text } = await generateText({
      model: gateway(models.fast),
      system: `You are a schema evolution engine. Given an entity's current JSON schema and a list of prediction errors (facts that surprised the system), produce an UPDATED JSON schema that incorporates the new evidence.

Rules:
- Preserve existing fields unless directly contradicted
- Add new fields for novel dimensions
- Adjust value ranges for magnitude shifts
- Output ONLY valid JSON, no markdown fences or explanation`,
      prompt: `Current schema:\n${JSON.stringify(currentSchema, null, 2)}\n\nPrediction errors:\n${errorFacts}`,
    })

    const updated = JSON.parse(text.trim())
    if (typeof updated !== 'object' || updated === null || Array.isArray(updated)) {
      logger.warn('predictive-coding: updateSchemaFromErrors got non-object response')
      return currentSchema
    }
    return updated as Record<string, unknown>
  } catch (err) {
    logger.warn('predictive-coding: updateSchemaFromErrors failed, keeping current schema', {
      error: err instanceof Error ? err.message : String(err),
    })
    return currentSchema
  }
}
