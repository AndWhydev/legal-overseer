/**
 * Chief Librarian — Tier 3 domain profile synthesis & morning briefings.
 *
 * Synthesizes cross-domain rollups from entity dossiers using Merkle-tree
 * change detection (constituent_hashes). Only re-synthesizes a domain profile
 * when at least one underlying dossier has changed.
 *
 * Produces morning briefings that aggregate all 4 domain profiles into
 * actionable priorities, deadlines/risks, and new discoveries.
 *
 * Worker consumes SynthesisJobs from the synthesis queue at concurrency 1.
 */

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Worker } from 'bullmq'
import { gateway, generateText } from 'ai'

import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import { estimateTokenCount } from './dossier-compiler'
import type { DomainType, EntityDossier, DomainProfile } from './types'
import { createWorker, QUEUE_NAMES, type SynthesisJob } from './worker-infra'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum tokens for a synthesized domain profile. */
export const MAX_PROFILE_TOKENS = 3000

const ALL_DOMAINS: DomainType[] = ['financial', 'relational', 'operational', 'behavioral']

// ─── System Prompts ─────────────────────────────────────────────────────────

const DOMAIN_PROFILE_SYSTEM_PROMPT = `You are a domain profile synthesizer for a personal assistant's memory system.
Given a set of entity dossiers within a specific domain, create a synthesized domain profile in markdown.

The profile MUST contain these sections:
## Overview
A 2-3 sentence summary of the domain landscape — what's happening across all entities.

## Key Entities
Bullet list of the most important entities and their current status.

## Trends
Bullet list of cross-entity patterns, recurring themes, or directional changes.

## Risks
Bullet list of potential risks, concerns, or items needing attention. Write "None identified" if no risks are apparent.

Rules:
- Keep the profile concise — aim for under ${MAX_PROFILE_TOKENS} tokens
- Synthesize across entities, don't just concatenate dossiers
- Highlight cross-entity relationships and patterns
- Output ONLY the markdown profile, no preamble or explanation`

const MORNING_BRIEFING_SYSTEM_PROMPT = `You are a morning briefing generator for a personal assistant.
Given domain profiles across financial, relational, operational, and behavioral domains,
synthesize a concise morning briefing.

The briefing MUST contain:
1. Top 5 priorities — the most important things to focus on today
2. Upcoming deadlines and risks — time-sensitive items and potential issues
3. New discoveries — recently learned information worth noting

Rules:
- Be actionable and specific, not vague
- Prioritize by urgency and importance
- Keep the total briefing concise
- Output ONLY the briefing markdown, no preamble or explanation`

// ─── computeDossierHash ────────────────────────────────────────────────────

/**
 * Compute a SHA-256 hex hash of dossier markdown content.
 * Used for Merkle-tree change detection in domain profile synthesis.
 */
export function computeDossierHash(markdown: string): string {
  return createHash('sha256').update(markdown).digest('hex')
}

// ─── synthesizeDomainProfile ───────────────────────────────────────────────

/**
 * Synthesize a domain profile from constituent entity dossiers.
 *
 * 1. Load all entity dossiers for the org
 * 2. Compute current hashes of each dossier
 * 3. Compare against stored constituent_hashes in the existing profile
 * 4. If all hashes match, skip re-synthesis (return { updated: false })
 * 5. If any changed, synthesize via LLM and upsert the domain profile
 */
export async function synthesizeDomainProfile(
  supabase: SupabaseClient,
  orgId: string,
  domain: DomainType,
): Promise<{ updated: boolean }> {
  // 1. Load all entity dossiers for this org
  const { data: dossiers, error: dossierError } = await supabase
    .from('entity_dossiers')
    .select('*')
    .eq('org_id', orgId)

  if (dossierError) {
    logger.error('[chief-librarian] Failed to load entity dossiers', {
      error: dossierError,
      org_id: orgId,
    })
    throw new Error('Failed to load entity dossiers')
  }

  const entityDossiers = (dossiers || []) as EntityDossier[]

  // 2. Compute current hashes
  const currentHashes: Record<string, string> = {}
  for (const dossier of entityDossiers) {
    currentHashes[dossier.entity_id] = computeDossierHash(dossier.dossier_markdown)
  }

  // 3. Load existing domain profile
  const { data: existingProfile } = await supabase
    .from('domain_profiles')
    .select('*')
    .eq('org_id', orgId)
    .eq('domain', domain)
    .single()

  const existing = existingProfile as DomainProfile | null

  // 4. Compare constituent hashes — skip if all match
  if (existing && existing.constituent_hashes) {
    const storedHashes = existing.constituent_hashes
    const entityIds = Object.keys(currentHashes)
    const storedEntityIds = Object.keys(storedHashes)

    const allMatch =
      entityIds.length === storedEntityIds.length &&
      entityIds.every((id) => storedHashes[id] === currentHashes[id])

    if (allMatch) {
      logger.info('[chief-librarian] Domain profile up-to-date, skipping synthesis', {
        org_id: orgId,
        domain,
        entity_count: entityIds.length,
      })
      return { updated: false }
    }
  }

  // 5. Synthesize via LLM
  const dossiersBlock = entityDossiers
    .map((d) => `### ${d.entity_name}\n${d.dossier_markdown}`)
    .join('\n\n')

  logger.info('[chief-librarian] Synthesizing domain profile', {
    org_id: orgId,
    domain,
    dossier_count: entityDossiers.length,
  })

  const { text } = await generateText({
    model: gateway(models.balanced),
    system: DOMAIN_PROFILE_SYSTEM_PROMPT,
    prompt: `Domain: ${domain}\n\nEntity dossiers:\n\n${dossiersBlock}`,
    maxTokens: MAX_PROFILE_TOKENS,
  })

  const profileMarkdown = text.trim()
  const currentVersion = existing?.version ?? 0

  // 6. Upsert domain profile
  const { error: upsertError } = await supabase
    .from('domain_profiles')
    .upsert(
      {
        org_id: orgId,
        domain,
        profile_markdown: profileMarkdown,
        constituent_hashes: currentHashes,
        version: currentVersion + 1,
        last_compiled_at: new Date().toISOString(),
        token_count: estimateTokenCount(profileMarkdown),
      },
      { onConflict: 'org_id,domain' },
    )

  if (upsertError) {
    logger.error('[chief-librarian] Failed to upsert domain profile', {
      error: upsertError,
      org_id: orgId,
      domain,
    })
    throw new Error('Failed to upsert domain profile')
  }

  logger.info('[chief-librarian] Domain profile synthesized', {
    org_id: orgId,
    domain,
    version: currentVersion + 1,
    token_count: estimateTokenCount(profileMarkdown),
  })

  return { updated: true }
}

// ─── generateMorningBriefing ───────────────────────────────────────────────

/**
 * Generate a morning briefing by synthesizing all 4 domain profiles.
 *
 * 1. Load all domain profiles for the org
 * 2. Synthesize via Sonnet into priorities, deadlines/risks, discoveries
 * 3. Store as memory_palace_entry with category 'pattern', source 'consolidation'
 */
export async function generateMorningBriefing(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string> {
  // 1. Load all domain profiles
  const { data: profiles, error: profileError } = await supabase
    .from('domain_profiles')
    .select('*')
    .eq('org_id', orgId)

  if (profileError) {
    logger.error('[chief-librarian] Failed to load domain profiles', {
      error: profileError,
      org_id: orgId,
    })
    throw new Error('Failed to load domain profiles')
  }

  const domainProfiles = (profiles || []) as DomainProfile[]

  // 2. Synthesize briefing
  const profilesBlock = domainProfiles
    .map((p) => `### ${p.domain.toUpperCase()} Domain\n${p.profile_markdown}`)
    .join('\n\n')

  logger.info('[chief-librarian] Generating morning briefing', {
    org_id: orgId,
    profile_count: domainProfiles.length,
  })

  const { text } = await generateText({
    model: gateway(models.balanced),
    system: MORNING_BRIEFING_SYSTEM_PROMPT,
    prompt: `Domain profiles:\n\n${profilesBlock}`,
  })

  const briefing = text.trim()

  // 3. Store as memory_palace_entry
  const { error: insertError } = await supabase
    .from('memory_palace_entries')
    .insert({
      org_id: orgId,
      content: briefing,
      category: 'pattern',
      source: 'consolidation',
      created_at: new Date().toISOString(),
    })

  if (insertError) {
    logger.error('[chief-librarian] Failed to store morning briefing', {
      error: insertError,
      org_id: orgId,
    })
    // Don't throw — the briefing was generated, just failed to persist
  }

  logger.info('[chief-librarian] Morning briefing generated', {
    org_id: orgId,
    token_count: estimateTokenCount(briefing),
  })

  return briefing
}

// ─── startChiefLibrarian ───────────────────────────────────────────────────

/**
 * Start the Chief Librarian worker on the synthesis queue.
 *
 * Concurrency 1 — only one synthesis job processes at a time to avoid
 * conflicting profile updates and to respect LLM rate limits.
 *
 * Each SynthesisJob triggers:
 * 1. Synthesize all 4 domain profiles (with Merkle change detection)
 * 2. If any profile updated, generate a morning briefing
 */
export function startChiefLibrarian(supabase: SupabaseClient): Worker {
  const worker = createWorker<SynthesisJob>(
    QUEUE_NAMES.synthesis,
    async (job) => {
      const { org_id, trigger, updated_entity_ids } = job.data

      logger.info('[chief-librarian] Processing synthesis job', {
        org_id,
        trigger,
        updated_entity_count: updated_entity_ids.length,
        job_id: job.id,
      })

      let anyUpdated = false

      // Synthesize all 4 domain profiles
      for (const domain of ALL_DOMAINS) {
        try {
          const result = await synthesizeDomainProfile(supabase, org_id, domain)
          if (result.updated) anyUpdated = true
        } catch (err) {
          logger.error('[chief-librarian] Domain synthesis failed', {
            org_id,
            domain,
            error: err instanceof Error ? err.message : String(err),
          })
          // Continue with other domains
        }
      }

      // Generate morning briefing if any profile was updated
      if (anyUpdated) {
        try {
          await generateMorningBriefing(supabase, org_id)
        } catch (err) {
          logger.error('[chief-librarian] Morning briefing generation failed', {
            org_id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      logger.info('[chief-librarian] Synthesis job complete', {
        org_id,
        any_updated: anyUpdated,
        job_id: job.id,
      })
    },
    { concurrency: 1 },
  )

  logger.info('[chief-librarian] Worker started', {
    queueName: QUEUE_NAMES.synthesis,
    concurrency: 1,
  })

  return worker
}
