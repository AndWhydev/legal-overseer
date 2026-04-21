/**
 * Brain Consolidation Pipeline — Cron-compatible orchestrator for the
 * Living Brain v2 three-tier architecture.
 *
 * Replaces the BullMQ worker chain with a direct sequential pipeline
 * that runs per-org via Vercel cron. Same logic, zero Redis dependency.
 *
 * Pipeline:  WAL tail → fact extraction → entity grouping →
 *            dossier compilation → domain profile synthesis →
 *            mark consolidated
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@/lib/core/logger'
import type { DomainType, KnowledgeLogEntry } from './types'
import { readWALTail } from './wal-emitter'
import { extractFactsFromBatch, groupEntriesByEntity } from './intake-clerk'
import { processDomainJobDirect } from './section-librarian'
import { synthesizeDomainProfile } from './chief-librarian'
import { scoreSurprise, shouldUpdateSchema, updateSchemaFromErrors, SURPRISE_THRESHOLD } from './predictive-coding'
import { detectAndAlertAnomalies, detectCrossEntityPatternBreaks } from './anomaly-detector'
import { resolveEntityByAlias } from '@/lib/knowledge-graph/graph-queries'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BrainConsolidationReport {
  orgId: string
  walEntriesProcessed: number
  factsExtracted: number
  dossiersCompiled: number
  dossierErrors: number
  domainsUpdated: number
  entriesSkippedBySurprise: number
  anomaliesDetected: number
  alertsSent: number
  crossEntityBreaks: number
  startedAt: string
  completedAt: string
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

const ALL_DOMAINS: DomainType[] = ['financial', 'relational', 'operational', 'behavioral']
const WAL_BATCH_LIMIT = 100

/**
 * Run the full brain consolidation pipeline for a single org.
 *
 * 1. Read unconsolidated WAL entries
 * 2. (Optional) Filter by predictive coding surprise score
 * 3. Extract structured facts via Gemini Flash
 * 4. Group facts by entity, mapping back to WAL entry IDs
 * 5. Compile/update entity dossiers via Section Librarian
 * 6. Synthesize domain profiles via Chief Librarian (Merkle-tree skip)
 * 7. Mark WAL entries as consolidated
 */
export async function runBrainConsolidation(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BrainConsolidationReport> {
  const startedAt = new Date().toISOString()
  let entriesSkippedBySurprise = 0

  // 1. Read WAL tail
  const entries = await readWALTail(supabase, {
    org_id: orgId,
    limit: WAL_BATCH_LIMIT,
  })

  if (entries.length === 0) {
    return {
      orgId,
      walEntriesProcessed: 0,
      factsExtracted: 0,
      dossiersCompiled: 0,
      dossierErrors: 0,
      domainsUpdated: 0,
      entriesSkippedBySurprise: 0,
      anomaliesDetected: 0,
      alertsSent: 0,
      crossEntityBreaks: 0,
      startedAt,
      completedAt: new Date().toISOString(),
    }
  }

  const allEntryIds = entries.map((e) => e.id)

  // 2. Predictive coding filter (optional — gate behind env var)
  let filteredEntries = entries
  if (process.env.ENABLE_PREDICTIVE_CODING === 'true') {
    const { filtered, skipped } = await filterBySurprise(supabase, orgId, entries)
    filteredEntries = filtered
    entriesSkippedBySurprise = skipped
  }

  // 3. Extract structured facts
  const facts = await extractFactsFromBatch(filteredEntries)

  // 4. Group by entity, mapping to WAL entry IDs
  const grouped = groupEntriesByEntity(filteredEntries, facts)

  // 5. Compile dossiers per entity group
  let dossiersCompiled = 0
  let dossierErrors = 0
  const updatedDomains = new Set<DomainType>()
  let anomaliesDetected = 0
  let alertsSent = 0

  // Index filteredEntries by id so per-entity anomaly detection can look up
  // full rows without re-querying knowledge_log (REVIEW LO-01/LO-02).
  const entryById = new Map(filteredEntries.map((e) => [e.id, e]))

  for (const [, group] of grouped) {
    try {
      await processDomainJobDirect(
        supabase,
        orgId,
        group.entity_name,
        group.entry_ids,
        group.domain,
      )
      dossiersCompiled++
      updatedDomains.add(group.domain)

      // Anomaly detection pass for this entity
      try {
        const entityNode = await resolveEntityByAlias(supabase, orgId, group.entity_name)
        if (entityNode) {
          const walEntries = group.entry_ids
            .map((id) => entryById.get(id))
            .filter((e): e is KnowledgeLogEntry => Boolean(e))
          const anomalyResult = await detectAndAlertAnomalies(
            supabase,
            orgId,
            entityNode.id,
            walEntries,
          )
          anomaliesDetected += anomalyResult.anomaliesDetected
          alertsSent += anomalyResult.alertsSent
        }
      } catch (err) {
        logger.warn('[brain-consolidation] Anomaly detection failed for entity', {
          org_id: orgId,
          entity_name: group.entity_name,
          error: err instanceof Error ? err.message : String(err),
        })
        // Continue — anomaly detection is non-critical
      }
    } catch (err) {
      dossierErrors++
      logger.error('[brain-consolidation] Dossier compilation failed', {
        org_id: orgId,
        entity_name: group.entity_name,
        domain: group.domain,
        error: err instanceof Error ? err.message : String(err),
      })
      // Continue with remaining entities — don't abort pipeline
    }
  }

  // 6. Synthesize domain profiles (only for domains that had updates)
  let domainsUpdated = 0
  for (const domain of ALL_DOMAINS) {
    if (!updatedDomains.has(domain)) continue

    try {
      const result = await synthesizeDomainProfile(supabase, orgId, domain)
      if (result.updated) domainsUpdated++
    } catch (err) {
      logger.error('[brain-consolidation] Domain profile synthesis failed', {
        org_id: orgId,
        domain,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // 6b. Cross-entity anomaly aggregation
  let crossEntityBreaks = 0
  try {
    const crossResult = await detectCrossEntityPatternBreaks(supabase, orgId)
    crossEntityBreaks = crossResult.breaksDetected
    alertsSent += crossResult.alertsSent
  } catch (err) {
    logger.warn('[brain-consolidation] Cross-entity aggregation failed', {
      org_id: orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // 7. Mark ALL WAL entries as consolidated (including surprise-skipped)
  const now = new Date().toISOString()
  await supabase
    .from('knowledge_log')
    .update({ consolidated_at: now })
    .in('id', allEntryIds)

  const report: BrainConsolidationReport = {
    orgId,
    walEntriesProcessed: entries.length,
    factsExtracted: facts.length,
    dossiersCompiled,
    dossierErrors,
    domainsUpdated,
    entriesSkippedBySurprise,
    anomaliesDetected,
    alertsSent,
    crossEntityBreaks,
    startedAt,
    completedAt: new Date().toISOString(),
  }

  logger.info('[brain-consolidation] Pipeline complete', report)

  return report
}

// ─── Predictive Coding Filter ─────────────────────────────────────────────

/**
 * Filter WAL entries by surprise score. Entries below the threshold are
 * considered "expected" and skipped from dossier compilation.
 * Also triggers schema evolution when prediction errors accumulate.
 */
async function filterBySurprise(
  supabase: SupabaseClient,
  orgId: string,
  entries: KnowledgeLogEntry[],
): Promise<{ filtered: KnowledgeLogEntry[]; skipped: number }> {
  // Load entity schemas for surprise scoring
  const { data: dossiers } = await supabase
    .from('entity_dossiers')
    .select('entity_id, schema_json')
    .eq('org_id', orgId)

  const schemaMap = new Map<string, Record<string, unknown>>()
  for (const d of dossiers ?? []) {
    schemaMap.set(d.entity_id, (d.schema_json ?? {}) as Record<string, unknown>)
  }

  const filtered: KnowledgeLogEntry[] = []
  const allScores = new Map<string, typeof scores>()
  const scores: Array<{ entry: KnowledgeLogEntry; score: Awaited<ReturnType<typeof scoreSurprise>> }> = []

  for (const entry of entries) {
    // Use schema from first matching entity, or empty schema
    const entityId = entry.entity_ids[0]
    const schema = entityId ? (schemaMap.get(entityId) ?? {}) : {}

    const result = await scoreSurprise(entry, schema)
    scores.push({ entry, score: result })

    if (result.score >= SURPRISE_THRESHOLD) {
      filtered.push(entry)
    }

    // Track scores per entity for schema evolution
    if (entityId) {
      if (!allScores.has(entityId)) allScores.set(entityId, [])
      allScores.get(entityId)!.push({ entry, score: result })
    }
  }

  // Schema evolution: update schemas for entities with accumulated prediction errors
  for (const [entityId, entityScores] of allScores) {
    const surpriseScores = entityScores.map((s) => s.score)
    if (shouldUpdateSchema(surpriseScores)) {
      const schema = schemaMap.get(entityId) ?? {}
      const facts = entityScores.map((s) => s.entry)
      const updated = await updateSchemaFromErrors(schema, surpriseScores, facts)

      await supabase
        .from('entity_dossiers')
        .update({ schema_json: updated })
        .eq('org_id', orgId)
        .eq('entity_id', entityId)

      logger.info('[brain-consolidation] Schema evolved for entity', {
        org_id: orgId,
        entity_id: entityId,
        error_count: surpriseScores.length,
      })
    }
  }

  return { filtered, skipped: entries.length - filtered.length }
}
