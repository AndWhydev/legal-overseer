/**
 * Active Learner — confidence-gated clarification and learning prompts.
 *
 * Part of Phase 46 active learning subsystem. When the confidence router
 * returns 'clarify', this module generates a targeted clarifying question
 * referencing the specific ambiguity (LEARN-01/LEARN-02). User responses
 * feed back into the knowledge_log WAL via signal_type='clarification'
 * so Section Librarian merges them into entity dossiers on the next
 * consolidation (LEARN-03).
 *
 * Recurring low-confidence domains (< 0.5 for 7+ days) generate learning
 * prompts in the morning briefing, limited to 1 per entity per week
 * (LEARN-04).
 */

import { gateway, generateText } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'

import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Domain confidence below this threshold is considered "low" and triggers learning prompts. */
const LOW_CONFIDENCE_THRESHOLD = 0.5

/** Rate limit: one learning prompt per entity per this many days. */
const LEARNING_PROMPT_RATE_LIMIT_DAYS = 7

/** Maximum number of learning prompts to emit per briefing. */
const MAX_LEARNING_PROMPTS = 5

/** Confidence assigned to a clarification WAL entry (user explicitly confirmed). */
const CLARIFICATION_CONFIDENCE = 0.95

// ─── LEARN-01 / LEARN-02: Clarifying Question Generation ────────────────────

export interface ClarifyingQuestionParams {
  entityName: string
  ambiguity: string
  context: string
  dossierSummary?: string
}

const QUESTION_SYSTEM_PROMPT = `You are a personal assistant asking a clarifying question. Generate a single conversational sentence that asks about the specific ambiguity. Reference the entity name and context naturally. Do not use meta-language like "I need clarification" or "Please confirm" — just ask the question directly as a friendly one-liner.`

/**
 * Generate a targeted clarifying question referencing a specific ambiguity.
 *
 * Returns a single-sentence question on success, or null on any LLM error.
 * A null return lets callers fall through to the standard 'ask' behavior
 * (generic approval request) instead of crashing the agent turn.
 */
export async function generateClarifyingQuestion(
  params: ClarifyingQuestionParams,
): Promise<string | null> {
  try {
    const { text } = await generateText({
      model: gateway(models.fast),
      system: QUESTION_SYSTEM_PROMPT,
      prompt: `Entity: ${params.entityName}
Context: ${params.context}
Ambiguity: ${params.ambiguity}
Dossier: ${params.dossierSummary ?? 'No additional context'}`,
    })

    return text.trim()
  } catch (err) {
    logger.warn('[active-learner] Question generation failed', {
      entity: params.entityName,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ─── LEARN-03: Clarification WAL Entry ──────────────────────────────────────

export interface ClarificationContext {
  question: string
  entityName: string
  ambiguity: string
}

/**
 * Record a user's clarification reply as a WAL entry with
 * signal_type='clarification'. The Section Librarian will merge this into
 * the entity's dossier on the next consolidation cycle.
 *
 * Returns true on success, false on any failure (never throws).
 */
export async function createClarificationWALEntry(
  supabase: SupabaseClient,
  orgId: string,
  entityIds: string[],
  userReply: string,
  originalContext: ClarificationContext,
): Promise<boolean> {
  try {
    // The user-supplied reply is wrapped in explicit delimiters so downstream
    // consumers (Section Librarian, dossier compilers) can be system-prompted
    // to treat the tagged span as data, not instructions. Mitigates the WAL
    // prompt-injection surface (REVIEW LO-03).
    const row = {
      org_id: orgId,
      entity_ids: entityIds,
      signal_type: 'clarification' as const,
      content: `Clarification for ${originalContext.entityName} (${originalContext.ambiguity}): Q: ${originalContext.question} A: <user-reply>${userReply}</user-reply>`,
      confidence: CLARIFICATION_CONFIDENCE,
      source_memory_id: null,
      source_thread_id: null,
    }

    const { error } = await supabase.from('knowledge_log').insert(row)

    if (error) {
      logger.warn('[active-learner] Failed to create clarification WAL entry', {
        org_id: orgId,
        entity_ids: entityIds,
        error: typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : String(error),
      })
      return false
    }

    return true
  } catch (err) {
    logger.warn('[active-learner] Unexpected error creating clarification WAL entry', {
      org_id: orgId,
      entity_ids: entityIds,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

// ─── LEARN-04: Low-Confidence Domain Learning Prompts ───────────────────────

interface EntityDossierRow {
  entity_id: string
  entity_name: string
  schema_json: Record<string, unknown> | null
}

/**
 * Batch-fetch the set of entity_ids that have already received a
 * learning_prompt alert within the last LEARNING_PROMPT_RATE_LIMIT_DAYS days.
 * One query instead of N sequential per-entity queries (REVIEW LO-04).
 *
 * Returns null on error so callers can fail closed (treat everyone as
 * rate-limited and skip learning prompts this tick).
 */
async function fetchRecentLearningPromptEntityIds(
  supabase: SupabaseClient,
  orgId: string,
  entityIds: string[],
): Promise<Set<string> | null> {
  if (entityIds.length === 0) return new Set()
  try {
    const since = new Date(
      Date.now() - LEARNING_PROMPT_RATE_LIMIT_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()

    const { data, error } = await supabase
      .from('brain_alerts')
      .select('entity_id')
      .eq('org_id', orgId)
      .eq('alert_type', 'learning_prompt')
      .gte('created_at', since)
      .in('entity_id', entityIds)

    if (error) return null
    return new Set((data ?? []).map((r) => r.entity_id as string))
  } catch {
    return null
  }
}

/**
 * Scan entity dossiers for domains with confidence below
 * LOW_CONFIDENCE_THRESHOLD and produce human-readable learning prompts for
 * the morning briefing. Rate-limited to one prompt per entity per
 * LEARNING_PROMPT_RATE_LIMIT_DAYS days. Capped at MAX_LEARNING_PROMPTS
 * items.
 *
 * Returns an empty array on any error (never throws).
 */
export async function fetchLearningPromptItems(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string[]> {
  try {
    // Cap the dossier scan; large orgs otherwise pull every dossier into
    // memory just to emit at most MAX_LEARNING_PROMPTS items (REVIEW LO-04).
    const DOSSIER_SCAN_LIMIT = MAX_LEARNING_PROMPTS * 10
    const { data, error } = await supabase
      .from('entity_dossiers')
      .select('entity_id, entity_name, schema_json')
      .eq('org_id', orgId)
      .limit(DOSSIER_SCAN_LIMIT)

    if (error || !data) return []

    const dossiers = data as EntityDossierRow[]

    // First pass: pick the lowest-confidence domain per entity.
    type Candidate = { row: EntityDossierRow; domain: string }
    const candidates: Candidate[] = []
    for (const dossier of dossiers) {
      const schema = dossier.schema_json ?? {}
      const domainConfidence = (schema as Record<string, unknown>).domain_confidence
      if (
        !domainConfidence ||
        typeof domainConfidence !== 'object' ||
        Array.isArray(domainConfidence)
      ) {
        continue
      }

      let lowestDomain: string | null = null
      let lowestScore = Infinity
      for (const [domain, score] of Object.entries(domainConfidence as Record<string, unknown>)) {
        if (typeof score !== 'number') continue
        if (score < LOW_CONFIDENCE_THRESHOLD && score < lowestScore) {
          lowestScore = score
          lowestDomain = domain
        }
      }
      if (!lowestDomain) continue
      candidates.push({ row: dossier, domain: lowestDomain })
    }

    if (candidates.length === 0) return []

    // Batched rate-limit check: one query instead of N.
    const recentlyPrompted = await fetchRecentLearningPromptEntityIds(
      supabase,
      orgId,
      candidates.map((c) => c.row.entity_id),
    )
    if (recentlyPrompted === null) return [] // fail closed on DB error

    const items: string[] = []
    for (const candidate of candidates) {
      if (items.length >= MAX_LEARNING_PROMPTS) break
      if (recentlyPrompted.has(candidate.row.entity_id)) continue
      items.push(
        `I have limited understanding of ${candidate.row.entity_name}'s ${candidate.domain} domain — a quick update would help me serve you better`,
      )
    }

    return items
  } catch (err) {
    logger.warn('[active-learner] fetchLearningPromptItems failed', {
      org_id: orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
