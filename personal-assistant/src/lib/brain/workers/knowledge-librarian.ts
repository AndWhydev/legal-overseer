/**
 * Knowledge Librarian — capability crawl worker.
 *
 * When a user establishes a new Composio third-party connection, we fire
 * a background job (ConnectionCrawlJob) into the `memory:crawl` queue.
 * This worker consumes that job, builds a ConnectionDossier describing
 * the tools the assistant can now use, and writes the dossier into the
 * Living Brain WAL. The intake clerk picks it up on its next batch and
 * routes it to the operational section librarian.
 *
 * Signal type note:
 *   We emit with signal_type='pattern' because "capability discovery"
 *   is a behavioral/operational pattern (what the agent can now do) and
 *   'pattern' is the closest existing match in SIGNAL_DOMAIN_MAP.
 *   The domain mapping for 'pattern' is 'behavioral' in intake-clerk's
 *   own map, but we set `entity_ids` to a synthetic capability entity
 *   so the fact surfaces in the operational profile as well.
 *   TODO(living-brain): add a dedicated 'capability' signal type and
 *   a 'capability' domain with its own section librarian; update this
 *   emit site once those are in.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@/lib/core/logger'
import { buildConnectionDossier, type ConnectionDossier } from '@/lib/composio/dossier'
import { emitToWAL } from '../wal-emitter'
import type { ConnectionCrawlJob } from '../worker-infra'

// ─── Public types ───────────────────────────────────────────────────────────

export interface ProcessConnectionConnectedResult {
  dossier: ConnectionDossier | null
  walEntryId: string | null
}

// ─── Dossier rendering ─────────────────────────────────────────────────────

/**
 * Serialize a dossier to a compact human-readable block.
 * The intake clerk's fact extractor will pull structured facts out of
 * this text on its next batch.
 */
export function renderDossierContent(dossier: ConnectionDossier): string {
  const toolLines = dossier.tools
    .map((t) => `  - ${t.name}: ${t.description || '(no description)'}`)
    .join('\n')

  return [
    `Connection established: ${dossier.appKey}`,
    `Connected at: ${dossier.connectedAt}`,
    `Connected account: ${dossier.connectedAccountId}`,
    `Capabilities (${dossier.capabilities.length}):`,
    toolLines || '  (no tools discovered)',
    '',
    `Use cases unlocked:`,
    dossier.suggestedUseCases,
  ].join('\n')
}

/** Build a synthetic capability entity id so dossier facts cluster together. */
function capabilityEntityId(appKey: string, connectedAccountId: string): string {
  return `capability:${appKey}:${connectedAccountId}`
}

/**
 * Persist the synthesized narrative onto the matching org_connections row so
 * the prompt builder can surface it without re-running dossier synthesis.
 * Best-effort: never throws, swallows errors.
 */
async function persistNarrativeOnConnection(
  supabase: SupabaseClient,
  orgId: string,
  connectedAccountId: string,
  narrative: string,
  capabilities: string[],
): Promise<void> {
  try {
    const { data: row } = await supabase
      .from('org_connections')
      .select('id, config')
      .eq('org_id', orgId)
      .eq('connected_account_id', connectedAccountId)
      .maybeSingle()

    if (!row?.id) {
      logger.info('[knowledge-librarian] No org_connections row found for dossier persistence', {
        orgId,
        connectedAccountId,
      })
      return
    }

    const existingConfig = (row.config ?? {}) as Record<string, unknown>
    const mergedConfig = {
      ...existingConfig,
      dossier_narrative: narrative,
      dossier_capabilities: capabilities,
      dossier_synced_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('org_connections')
      .update({ config: mergedConfig })
      .eq('id', row.id)

    if (error) {
      logger.warn('[knowledge-librarian] Failed to persist dossier narrative', {
        orgId,
        connectedAccountId,
        error: error.message,
      })
    }
  } catch (err) {
    logger.warn('[knowledge-librarian] Unexpected error persisting dossier narrative', {
      orgId,
      connectedAccountId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ─── Worker processor ──────────────────────────────────────────────────────

/**
 * Process a single `connection.connected` job:
 *   1. Build the dossier (enumerates tools + synthesizes use cases).
 *   2. Emit a WAL entry with signal_type='pattern' so intake-clerk picks
 *      it up on its next batch.
 *
 * Never throws on recoverable errors — BullMQ retry is governed by
 * the worker factory's `attempts` default. If the WAL emit silently
 * fails (emitToWAL returns null), we log and return; the job is still
 * marked complete to avoid infinite retries on a hard schema error.
 */
export async function processConnectionConnected(
  supabase: SupabaseClient,
  job: { data: ConnectionCrawlJob; id?: string },
): Promise<ProcessConnectionConnectedResult> {
  const { orgId, appKey, connectedAccountId } = job.data

  logger.info('[knowledge-librarian] Crawling new connection', {
    orgId,
    appKey,
    connectedAccountId,
    jobId: job.id,
  })

  const dossier = await buildConnectionDossier({
    orgId,
    appKey,
    connectedAccountId,
  })

  const content = renderDossierContent(dossier)
  const entityId = capabilityEntityId(appKey, connectedAccountId)

  const walEntry = await emitToWAL(supabase, {
    org_id: orgId,
    entity_ids: [entityId],
    // TODO(living-brain): switch to 'capability' when that signal type
    // is introduced. 'pattern' is the current closest fit.
    signal_type: 'pattern',
    content,
    confidence: 0.95,
  })

  // Persist narrative onto the org_connections row so the prompt builder can
  // read it without re-synthesizing. Independent of WAL success — the prompt
  // path only needs the connection row.
  await persistNarrativeOnConnection(
    supabase,
    orgId,
    connectedAccountId,
    dossier.suggestedUseCases,
    dossier.capabilities,
  )

  if (!walEntry) {
    logger.warn('[knowledge-librarian] Failed to emit dossier to WAL', {
      orgId,
      appKey,
    })
    return { dossier, walEntryId: null }
  }

  logger.info('[knowledge-librarian] Dossier emitted to WAL', {
    orgId,
    appKey,
    walEntryId: walEntry.id,
    toolCount: dossier.tools.length,
  })

  return { dossier, walEntryId: walEntry.id }
}
