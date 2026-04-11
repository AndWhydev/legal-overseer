/**
 * L1 Prompt Cache — Brain State Prefix Builder
 *
 * Constructs a cacheable prefix for Anthropic's prompt caching.
 * The prefix contains stable, slowly-changing context (user profile,
 * fiduciary constraints, entity dossiers, domain profiles) that
 * benefits from the 1-hour cache TTL.
 *
 * 90% read cost reduction and 85% latency reduction on cached prefix.
 * At 50K tokens cached with 10 queries/hour, this is the single biggest
 * cost optimization.
 *
 * Sections (in order):
 *   1. System prompt (always)
 *   2. User profile (if provided)
 *   3. Fiduciary constraints (from memory_palace_entries)
 *   4. Top entity dossiers (by last_compiled_at DESC)
 *   5. Domain profiles (by last_compiled_at DESC)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserProfile } from '@/lib/agent/prompt-builder'
import { logger } from '@/lib/core/logger'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum token budget for the cacheable prefix. */
export const CACHE_PREFIX_BUDGET = 50_000

/** Approximate characters per token for estimation. */
export const CHARS_PER_TOKEN = 3.5

/** Reserved token budget for fiduciary constraints (always included). */
export const FIDUCIARY_RESERVED_TOKENS = 2000

/** Maximum tokens per domain profile section. */
export const DOMAIN_PROFILE_MAX_TOKENS = 8000

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BrainStatePrefix {
  /** Assembled markdown content for the cached prefix. */
  markdown: string
  /** Estimated token count of the prefix. */
  tokenEstimate: number
  /** Number of entity dossiers included. */
  dossierCount: number
  /** Number of fiduciary constraints included. */
  constraintCount: number
  /** Number of domain profiles included. */
  profileCount: number
  /** ISO timestamp when this prefix was built. */
  builtAt: string
}

export interface CacheableContext {
  /** Content blocks with cache_control for Anthropic prompt caching. */
  cachedPrefix: Array<{
    type: 'text'
    text: string
    cache_control: { type: 'ephemeral' }
  }>
  /** Dynamic content blocks without cache_control. */
  dynamicSuffix: Array<{
    type: 'text'
    text: string
  }>
}

// ─── Token Estimation ───────────────────────────────────────────────────────

/**
 * Estimate token count from text length.
 * Returns Math.ceil(text.length / CHARS_PER_TOKEN). Empty/null/undefined -> 0.
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

// ─── Options ────────────────────────────────────────────────────────────────

export interface BuildPrefixOptions {
  userProfile?: UserProfile
}

// ─── buildBrainStatePrefix ─────────────────────────────────────────────────

/**
 * Build a cacheable brain state prefix from stable context sources.
 *
 * Assembles the prefix in deterministic section order, tracking token
 * budget to stay within CACHE_PREFIX_BUDGET. Each section subtracts
 * from the remaining budget.
 */
export async function buildBrainStatePrefix(
  supabase: SupabaseClient,
  orgId: string,
  systemPrompt: string,
  opts?: BuildPrefixOptions,
): Promise<BrainStatePrefix> {
  const sections: string[] = []
  let remainingTokens = CACHE_PREFIX_BUDGET
  let dossierCount = 0
  let constraintCount = 0
  let profileCount = 0

  // ── Section 1: System prompt (always included) ───────────────────────

  sections.push(systemPrompt)
  remainingTokens -= estimateTokens(systemPrompt)

  // ── Section 2: User profile (if provided) ────────────────────────────

  if (opts?.userProfile) {
    const profileSection = formatUserProfileSection(opts.userProfile)
    if (profileSection) {
      const profileTokens = estimateTokens(profileSection)
      if (profileTokens <= remainingTokens) {
        sections.push(profileSection)
        remainingTokens -= profileTokens
      }
    }
  }

  // ── Section 3: Fiduciary constraints ─────────────────────────────────
  // These always get included when they exist (critical for user protection).

  try {
    const { data: constraints, error } = await supabase
      .from('memory_palace_entries')
      .select('id, content')
      .eq('org_id', orgId)
      .eq('category', 'fiduciary_constraint')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && constraints && constraints.length > 0) {
      const constraintLines = constraints.map(
        (c: { content: string }) => `- ${c.content}`,
      )
      const constraintSection = `## Fiduciary Constraints\n\n${constraintLines.join('\n')}`
      const constraintTokens = estimateTokens(constraintSection)

      // Fiduciary constraints get reserved budget — always include
      if (constraintTokens <= Math.max(remainingTokens, FIDUCIARY_RESERVED_TOKENS)) {
        sections.push(constraintSection)
        remainingTokens -= constraintTokens
        constraintCount = constraints.length
      }
    }
  } catch (err) {
    logger.warn('[prompt-cache] Failed to load fiduciary constraints', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // ── Section 4: Top entity dossiers ───────────────────────────────────
  // Reserve space for domain profiles before filling with dossiers.

  const dossierBudget = Math.max(0, remainingTokens - DOMAIN_PROFILE_MAX_TOKENS)

  try {
    const { data: dossiers, error } = await supabase
      .from('entity_dossiers')
      .select('entity_id, entity_name, dossier_markdown, token_count, last_compiled_at')
      .eq('org_id', orgId)
      .order('last_compiled_at', { ascending: false })
      .limit(30)

    if (!error && dossiers && dossiers.length > 0) {
      let dossierTokensUsed = 0
      const includedDossiers: string[] = []

      for (const d of dossiers as Array<{
        entity_name: string
        dossier_markdown: string
        token_count: number
      }>) {
        const dossierText = `### ${d.entity_name}\n${d.dossier_markdown}`
        const dTokens = estimateTokens(dossierText)

        if (dossierTokensUsed + dTokens > dossierBudget) break

        includedDossiers.push(dossierText)
        dossierTokensUsed += dTokens
        dossierCount++
      }

      if (includedDossiers.length > 0) {
        const dossierSection = `## Entity Dossiers\n\n${includedDossiers.join('\n\n')}`
        sections.push(dossierSection)
        remainingTokens -= dossierTokensUsed
      }
    }
  } catch (err) {
    logger.warn('[prompt-cache] Failed to load entity dossiers', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // ── Section 5: Domain profiles ───────────────────────────────────────

  try {
    const { data: profiles, error } = await supabase
      .from('domain_profiles')
      .select('domain, profile_markdown, token_count, last_compiled_at')
      .eq('org_id', orgId)
      .order('last_compiled_at', { ascending: false })
      .limit(4)

    if (!error && profiles && profiles.length > 0) {
      const includedProfiles: string[] = []
      let profileTokensUsed = 0

      for (const p of profiles as Array<{
        domain: string
        profile_markdown: string
        token_count: number
      }>) {
        const profileText = `### ${p.domain.charAt(0).toUpperCase() + p.domain.slice(1)} Domain\n${p.profile_markdown}`
        const pTokens = estimateTokens(profileText)

        if (profileTokensUsed + pTokens > remainingTokens) break

        includedProfiles.push(profileText)
        profileTokensUsed += pTokens
        profileCount++
      }

      if (includedProfiles.length > 0) {
        const profileSection = `## Domain Profiles\n\n${includedProfiles.join('\n\n')}`
        sections.push(profileSection)
        remainingTokens -= profileTokensUsed
      }
    }
  } catch (err) {
    logger.warn('[prompt-cache] Failed to load domain profiles', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // ── Assemble final prefix ────────────────────────────────────────────

  const markdown = sections.join('\n\n')
  const tokenEstimate = estimateTokens(markdown)

  logger.info('[prompt-cache] Brain state prefix built', {
    tokenEstimate,
    budget: CACHE_PREFIX_BUDGET,
    dossierCount,
    constraintCount,
    profileCount,
    sectionCount: sections.length,
  })

  return {
    markdown,
    tokenEstimate,
    dossierCount,
    constraintCount,
    profileCount,
    builtAt: new Date().toISOString(),
  }
}

// ─── splitCacheableContext ──────────────────────────────────────────────────

/**
 * Split a brain state prefix and dynamic content into Anthropic-compatible
 * content blocks with cache_control annotations.
 *
 * The cached prefix gets `cache_control: { type: 'ephemeral' }` for
 * prompt caching. Dynamic content has no cache_control, so it is
 * evaluated fresh every request.
 */
export function splitCacheableContext(
  brainPrefix: BrainStatePrefix,
  dynamicContent: string,
): CacheableContext {
  const cachedPrefix: CacheableContext['cachedPrefix'] = [
    {
      type: 'text',
      text: brainPrefix.markdown,
      cache_control: { type: 'ephemeral' },
    },
  ]

  const dynamicSuffix: CacheableContext['dynamicSuffix'] = []
  if (dynamicContent && dynamicContent.length > 0) {
    dynamicSuffix.push({
      type: 'text',
      text: dynamicContent,
    })
  }

  return { cachedPrefix, dynamicSuffix }
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function formatUserProfileSection(profile: UserProfile): string {
  const lines: string[] = ['## User Profile']

  if (profile.displayName) {
    lines.push(`Name: ${profile.displayName}`)
  }
  if (profile.email) {
    lines.push(`Email: ${profile.email}`)
  }
  if (profile.connectedEmails && profile.connectedEmails.length > 0) {
    lines.push(`Connected emails: ${profile.connectedEmails.join(', ')}`)
  }

  return lines.length > 1 ? lines.join('\n') : ''
}
