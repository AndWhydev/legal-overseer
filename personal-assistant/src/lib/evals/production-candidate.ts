/**
 * production-candidate.ts — Real candidate runner for the eval pipeline.
 *
 * Replaces the stub from #112 with a function that actually invokes Claude
 * for each eval case using the same per-mode persona machinery (#94) the
 * production agent uses. Lets the rubric (#100) score what users actually
 * get, not a placeholder echo.
 *
 * Foundation only:
 *   - This is the *minimal* candidate. We do NOT run TAOR's full triage
 *     loop (it needs DB context, channel state, agent profile, etc.).
 *     Instead we call Claude with the persona + mode-shaped system prompt,
 *     which is what the per-mode model routing PR (#94) actually changed.
 *     That's the layer the rubric is measuring.
 *   - No tool use. The candidate is a pure conversational reply. Tool-use
 *     evaluation (does the agent call the right tool?) lands in a follow-up.
 *   - No memory / RAG retrieval. The eval case stands alone — we feed only
 *     `case.input` and let the persona-shaped model produce the reply.
 *
 * Why not just reuse the TAOR loop:
 *   TAOR is the production triage path: DB lookups for channel state,
 *   memory hits, decision trace logs, dossier loads, and so on. None of
 *   that runs in the eval container's environment, and stubbing all of it
 *   would mean evaluating the stubs, not the model. The persona layer is
 *   the smallest unit that captures what #94 changed about model behavior.
 */

import Anthropic from '@anthropic-ai/sdk'
import { resolvePersona, getModePurpose } from '@/lib/dashboard/mode-personas'
import type { CandidateRunner } from './eval-runner'

// ─── Model selection ──────────────────────────────────────────────────────────

/**
 * Model id per modelPurpose. Mirrors what taor-loop selects in production
 * (#94) — keep these in sync.
 *
 * - classification: cheap + fast (inbox triage). Haiku-class.
 * - synthesis:      careful numeric reasoning (money). Opus-class.
 * - conversation:   default (chat / work). Sonnet-class.
 */
const MODEL_BY_PURPOSE: Record<string, string> = {
  classification: 'claude-haiku-4-5-20251001',
  synthesis: 'claude-opus-4-7',
  conversation: 'claude-sonnet-4-6',
}

const DEFAULT_MODEL = MODEL_BY_PURPOSE.conversation

function modelForMode(mode: string): string {
  const purpose = getModePurpose(mode)
  return MODEL_BY_PURPOSE[purpose] ?? DEFAULT_MODEL
}

// ─── Candidate ────────────────────────────────────────────────────────────────

/**
 * Build a candidate runner that invokes Claude per case using the mode-
 * shaped persona and routing from the production stack. The Anthropic
 * client is injected so tests can stub it without monkey-patching the
 * SDK module.
 */
/** Compose the persona's two prompt fragments into a single system string. */
function buildSystem(persona: ReturnType<typeof resolvePersona>): string {
  const parts = [persona.systemPromptFragment, persona.toneDirectives].filter(Boolean)
  return parts.join('\n\n')
}

export function makeProductionCandidate(client: Anthropic): CandidateRunner {
  return async (evalCase) => {
    const persona = resolvePersona(evalCase.mode)
    const model = modelForMode(evalCase.mode)

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: buildSystem(persona),
      messages: [{ role: 'user', content: evalCase.input }],
    })

    const block = response.content.find(b => b.type === 'text')
    return block?.type === 'text' ? block.text : ''
  }
}

/**
 * Identifier reported on each JudgedSubmission so trend queries can group
 * by candidate. The actual model name varies per case (haiku/opus/sonnet),
 * so we use a stable label that reflects "production routing as of this
 * deploy" — git SHA-based variants land in a follow-up.
 */
export const PRODUCTION_CANDIDATE_LABEL = 'production:per-mode-routed'
