/**
 * Surprise Surfacer — Proactive insight generation from high-surprise facts.
 *
 * Queries recent knowledge_log entries for given entities, scores them
 * against entity schemas via the predictive coding engine, and returns
 * high-surprise facts (>0.7) formatted as proactive insights.
 *
 * Surfaced facts are marked (consolidated_at set) to avoid repetition.
 * Channel-aware formatting: SMS/WhatsApp gets brief one-liners,
 * dashboard gets richer detail.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@/lib/core/logger'
import { scoreSurprise } from './predictive-coding'
import type { KnowledgeLogEntry, SurpriseScore } from './types'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Only surface facts with surprise score above this threshold. */
export const PROACTIVE_SURPRISE_THRESHOLD = 0.7

/** Maximum number of WAL entries to scan per surfacing call. */
const MAX_WAL_SCAN = 10

/** How far back (in hours) to look for recent entries. */
const LOOKBACK_HOURS = 24

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SurfacedFact {
  factId: string
  content: string
  score: number
  deviationType: SurpriseScore['deviation_type']
}

export type SurfaceChannel = 'web' | 'sendblue' | 'telegram' | 'whatsapp'

// ─── getSurpriseFacts ───────────────────────────────────────────────────────

/**
 * Query recent knowledge_log entries for given entity IDs, score them
 * against entity schemas, and return high-surprise facts as proactive
 * insights. Marks surfaced facts to prevent repetition.
 *
 * Returns empty array if no entities, no entries, or no high-surprise facts.
 * Never throws — failures are logged and return empty.
 */
export async function getSurpriseFacts(
  supabase: SupabaseClient,
  orgId: string,
  entityIds: string[],
): Promise<SurfacedFact[]> {
  if (entityIds.length === 0) return []

  try {
    // 1. Query recent unconsolidated WAL entries for these entities
    const lookbackSince = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()

    const { data: walEntries, error: walError } = await supabase
      .from('knowledge_log')
      .select('*')
      .eq('org_id', orgId)
      .overlaps('entity_ids', entityIds)
      .gte('created_at', lookbackSince)
      .is('consolidated_at', null)
      .order('created_at', { ascending: false })
      .limit(MAX_WAL_SCAN)

    if (walError) {
      logger.warn('[surprise-surfacer] Failed to query WAL entries', {
        error: walError.message,
        org_id: orgId,
      })
      return []
    }

    const entries = (walEntries ?? []) as KnowledgeLogEntry[]
    if (entries.length === 0) return []

    // 2. Load entity schemas for surprise scoring
    const { data: dossiers } = await supabase
      .from('entity_dossiers')
      .select('entity_id, schema_json')
      .eq('org_id', orgId)
      .in('entity_id', entityIds)

    const schemaMap = new Map<string, Record<string, unknown>>()
    for (const d of dossiers ?? []) {
      schemaMap.set(d.entity_id, (d.schema_json ?? {}) as Record<string, unknown>)
    }

    // 3. Score each entry against its entity schema
    const surfaced: SurfacedFact[] = []
    const surfacedIds: string[] = []

    for (const entry of entries) {
      const entityId = entry.entity_ids[0]
      const schema = entityId ? (schemaMap.get(entityId) ?? {}) : {}

      const result = await scoreSurprise(entry, schema)

      if (result.score > PROACTIVE_SURPRISE_THRESHOLD) {
        surfaced.push({
          factId: entry.id,
          content: entry.content,
          score: result.score,
          deviationType: result.deviation_type,
        })
        surfacedIds.push(entry.id)
      }
    }

    // 4. Mark surfaced entries as consolidated to avoid repeating
    if (surfacedIds.length > 0) {
      const now = new Date().toISOString()
      await supabase
        .from('knowledge_log')
        .update({ consolidated_at: now })
        .in('id', surfacedIds)

      logger.info('[surprise-surfacer] Surfaced high-surprise facts', {
        org_id: orgId,
        count: surfacedIds.length,
        scores: surfaced.map(s => s.score),
      })
    }

    return surfaced
  } catch (err) {
    logger.warn('[surprise-surfacer] Unexpected error', {
      error: err instanceof Error ? err.message : String(err),
      org_id: orgId,
    })
    return []
  }
}

// ─── Channel-Aware Formatting ───────────────────────────────────────────────

/**
 * Format surfaced surprise facts for the given channel.
 *
 * - SMS/WhatsApp: Brief one-liner per fact ("Heads up: [fact]")
 * - Dashboard/web: Richer format with deviation context
 *
 * Returns empty string if no facts to surface.
 */
export function formatSurpriseForChannel(
  facts: SurfacedFact[],
  channel: SurfaceChannel,
): string {
  if (facts.length === 0) return ''

  const isCompact = channel === 'sendblue' || channel === 'whatsapp'

  if (isCompact) {
    // SMS/WhatsApp: brief one-liners
    const lines = facts.map(f => `Heads up: ${f.content}`)
    return lines.join('\n')
  }

  // Dashboard/web: richer format
  const lines = facts.map(f => {
    const label = deviationLabel(f.deviationType)
    return `Unusual: ${f.content} (${label})`
  })

  return '\n---\n' + lines.join('\n')
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function deviationLabel(type: SurpriseScore['deviation_type']): string {
  switch (type) {
    case 'contradicts_schema': return 'contradicts known pattern'
    case 'magnitude_shift': return 'significant change in magnitude'
    case 'novel_dimension': return 'new pattern detected'
    case 'expected': return 'unexpected for this context'
  }
}
