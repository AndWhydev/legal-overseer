/**
 * Section Librarian — Tier 2 domain queue workers.
 *
 * Consumes LibrarianJobs from domain queues (financial, relational,
 * operational, behavioral), compiles/updates entity dossiers via
 * delta-merge, and strengthens co-occurrence edges via Hebbian learning.
 *
 * Each domain queue runs with concurrency 3.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Worker } from 'bullmq'

import { logger } from '@/lib/core/logger'
import type { KnowledgeLogEntry, EntityDossier, DomainType } from './types'
import { createWorker, QUEUE_NAMES, type LibrarianJob } from './worker-infra'
import { compileDossierDelta } from './dossier-compiler'
import {
  resolveEntityByAlias,
  hebbianStrengthen,
} from '@/lib/knowledge-graph/graph-queries'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LibrarianJobWithContext extends LibrarianJob {
  entity_name: string
  facts: string[]
}

// ─── processDomainJob ───────────────────────────────────────────────────────

/**
 * Process a single domain queue job:
 * 1. Resolve entity_id from entity_name (create if missing)
 * 2. Load current dossier
 * 3. Load WAL entries by fact_ids
 * 4. Compile dossier delta
 * 5. Upsert entity_dossiers
 * 6. Hebbian-strengthen co-occurring entity edges
 */
export async function processDomainJob(
  supabase: SupabaseClient,
  job: LibrarianJobWithContext,
): Promise<void> {
  const { org_id, entity_name, fact_ids, domain } = job

  // 1. Resolve entity by alias; create if not found
  let entity = await resolveEntityByAlias(supabase, org_id, entity_name)

  if (!entity) {
    logger.info('[section-librarian] Creating new entity node', {
      org_id,
      entity_name,
    })
    const { data, error } = await supabase
      .from('entity_nodes')
      .insert({
        org_id,
        entity_type: 'person' as const,
        name: entity_name,
        aliases: [entity_name.toLowerCase()],
        properties: {},
      })
      .select('*')
      .single()

    if (error || !data) {
      logger.error('[section-librarian] Failed to create entity node', {
        error,
        entity_name,
      })
      throw new Error(`Failed to create entity node for "${entity_name}"`)
    }
    entity = data
  }

  const entityId = entity!.id

  // 2. Load current dossier
  const { data: currentDossier } = await supabase
    .from('entity_dossiers')
    .select('*')
    .eq('org_id', org_id)
    .eq('entity_id', entityId)
    .single()

  // 3. Load actual WAL entries by fact_ids
  const { data: walEntries, error: walError } = await supabase
    .from('knowledge_log')
    .select('*')
    .in('id', fact_ids)

  if (walError) {
    logger.error('[section-librarian] Failed to load WAL entries', {
      error: walError,
      fact_ids,
    })
    throw new Error('Failed to load WAL entries')
  }

  const entries = (walEntries || []) as KnowledgeLogEntry[]

  if (entries.length === 0) {
    logger.warn('[section-librarian] No WAL entries found for fact_ids', {
      fact_ids,
      entity_name,
    })
    return
  }

  // 4. Compile dossier delta
  const compiled = await compileDossierDelta({
    entity_id: entityId,
    new_facts: entries,
    current_dossier: (currentDossier as EntityDossier) || null,
  })

  // 5. Upsert into entity_dossiers
  const currentVersion = (currentDossier as EntityDossier)?.version ?? 0
  const currentFactsIncorporated =
    (currentDossier as EntityDossier)?.facts_incorporated ?? 0
  const lastFactId = entries[entries.length - 1].id

  const { error: upsertError } = await supabase
    .from('entity_dossiers')
    .upsert(
      {
        org_id,
        entity_id: entityId,
        entity_name,
        dossier_markdown: compiled.markdown,
        schema_json: (currentDossier as EntityDossier)?.schema_json ?? {},
        version: currentVersion + 1,
        last_compiled_at: new Date().toISOString(),
        stale_since: null,
        token_count: compiled.token_count,
        facts_incorporated: currentFactsIncorporated + entries.length,
        last_fact_id: lastFactId,
        compilation_model: compiled.model,
      },
      { onConflict: 'org_id,entity_id' },
    )

  if (upsertError) {
    logger.error('[section-librarian] Failed to upsert dossier', {
      error: upsertError,
      entity_id: entityId,
    })
    throw new Error('Failed to upsert entity dossier')
  }

  logger.info('[section-librarian] Dossier compiled', {
    entity_id: entityId,
    entity_name,
    domain,
    version: currentVersion + 1,
    token_count: compiled.token_count,
    facts_incorporated: currentFactsIncorporated + entries.length,
  })

  // 6. Hebbian-strengthen co-occurring entity edges
  // Find entities that share the same WAL entries (via entity_ids array)
  const coEntityIds = new Set<string>()
  for (const entry of entries) {
    for (const coId of entry.entity_ids) {
      if (coId !== entityId) {
        coEntityIds.add(coId)
      }
    }
  }

  for (const coEntityId of coEntityIds) {
    await hebbianStrengthen(supabase, org_id, entityId, coEntityId)
  }

  if (coEntityIds.size > 0) {
    logger.info('[section-librarian] Hebbian strengthening complete', {
      entity_id: entityId,
      co_entity_count: coEntityIds.size,
    })
  }
}

// ─── startSectionLibrarians ─────────────────────────────────────────────────

const DOMAIN_QUEUES: DomainType[] = [
  'financial',
  'relational',
  'operational',
  'behavioral',
]

/**
 * Start Section Librarian workers for all 4 domain queues.
 * Each worker runs with concurrency 3, consuming LibrarianJobs
 * and compiling entity dossiers.
 */
export function startSectionLibrarians(supabase: SupabaseClient): Worker[] {
  const workers: Worker[] = []

  for (const domain of DOMAIN_QUEUES) {
    const queueName = QUEUE_NAMES[domain]

    const worker = createWorker<LibrarianJobWithContext>(
      queueName,
      async (job) => {
        await processDomainJob(supabase, job.data)
      },
      { concurrency: 3 },
    )

    logger.info('[section-librarian] Worker started', {
      domain,
      queueName,
      concurrency: 3,
    })

    workers.push(worker)
  }

  return workers
}
