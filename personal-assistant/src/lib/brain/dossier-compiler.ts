/**
 * Dossier Compiler — Delta-merge strategy for entity dossiers.
 *
 * Compiles or updates per-entity dossier markdown using Sonnet (models.balanced).
 * Two paths:
 *   1. New dossier — create structured markdown from scratch
 *   2. Delta merge — merge new facts into existing dossier sections
 *
 * Token budget: MAX_DOSSIER_TOKENS (1500) per dossier to keep context lean.
 */

import { gateway, generateText } from 'ai'

import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import type { DossierDelta } from './types'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum tokens for a compiled dossier. */
export const MAX_DOSSIER_TOKENS = 1500

/** Approximate characters per token for estimation. */
export const CHARS_PER_TOKEN = 3.5

// ─── Token Estimation ───────────────────────────────────────────────────────

/**
 * Estimate token count from text length.
 * Returns Math.ceil(text.length / CHARS_PER_TOKEN). Empty/null/undefined → 0.
 */
export function estimateTokenCount(text: string): number {
  if (!text || text.length === 0) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

// ─── System Prompts ─────────────────────────────────────────────────────────

const NEW_DOSSIER_SYSTEM_PROMPT = `You are a dossier compiler for a personal assistant's memory system.
Given a set of facts about an entity, create a structured dossier in markdown.

The dossier MUST contain these sections:
## Summary
A 1-2 sentence overview of who/what this entity is.

## Key Facts
Bullet list of the most important factual details.

## Recent Activity
Bullet list of recent events or interactions.

## Patterns
Bullet list of observed behavioral patterns, preferences, or tendencies. Write "None observed yet" if too few facts.

Rules:
- Keep the dossier concise — aim for under ${MAX_DOSSIER_TOKENS} tokens
- Be factual and specific, not speculative
- Output ONLY the markdown dossier, no preamble or explanation`

const DELTA_MERGE_SYSTEM_PROMPT = `You are a dossier compiler for a personal assistant's memory system.
You will receive an existing dossier and new facts. Output ONLY the updated dossier.

Merge new facts into appropriate sections (## Summary, ## Key Facts, ## Recent Activity, ## Patterns).
Update contradicted facts — replace outdated information with the new data.
Move older "Recent Activity" items to "Key Facts" if they represent lasting information.
Keep the dossier concise — aim for under ${MAX_DOSSIER_TOKENS} tokens.

Rules:
- Preserve the 4-section structure (## Summary, ## Key Facts, ## Recent Activity, ## Patterns)
- Do not lose existing facts unless directly contradicted by new evidence
- Output ONLY the updated dossier markdown, no preamble or explanation`

// ─── compileDossierDelta ────────────────────────────────────────────────────

/**
 * Compile a dossier delta into updated markdown.
 *
 * New dossier (current_dossier is null or empty markdown):
 *   Creates a structured dossier from scratch via LLM.
 *
 * Delta merge (current_dossier exists with content):
 *   Sends current dossier + new facts to LLM for merge.
 *
 * Uses Sonnet (models.balanced) for higher-quality synthesis.
 */
export async function compileDossierDelta(
  delta: DossierDelta,
): Promise<{ markdown: string; token_count: number; model: string }> {
  const isNewDossier =
    !delta.current_dossier || !delta.current_dossier.dossier_markdown

  const factsBlock = delta.new_facts
    .map((f, i) => `${i + 1}. [${f.signal_type}] ${f.content}`)
    .join('\n')

  const model = models.balanced

  if (isNewDossier) {
    // Path 1: Create from scratch
    logger.info('[dossier-compiler] Creating new dossier', {
      entity_id: delta.entity_id,
      fact_count: delta.new_facts.length,
    })

    const { text } = await generateText({
      model: gateway(model),
      system: NEW_DOSSIER_SYSTEM_PROMPT,
      prompt: `Facts about this entity:\n${factsBlock}`,
      maxOutputTokens: MAX_DOSSIER_TOKENS,
    })

    const markdown = text.trim()
    return {
      markdown,
      token_count: estimateTokenCount(markdown),
      model,
    }
  }

  // Path 2: Delta merge
  logger.info('[dossier-compiler] Delta-merging dossier', {
    entity_id: delta.entity_id,
    fact_count: delta.new_facts.length,
    current_version: delta.current_dossier!.version,
  })

  const { text } = await generateText({
    model: gateway(model),
    system: DELTA_MERGE_SYSTEM_PROMPT,
    prompt: `Current dossier:\n${delta.current_dossier!.dossier_markdown}\n\nNew facts to merge:\n${factsBlock}`,
    maxOutputTokens: MAX_DOSSIER_TOKENS,
  })

  const markdown = text.trim()
  return {
    markdown,
    token_count: estimateTokenCount(markdown),
    model,
  }
}
