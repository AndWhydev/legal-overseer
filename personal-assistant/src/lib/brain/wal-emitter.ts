/**
 * WAL Emitter — Dual-write to knowledge_log for Living Brain workers.
 *
 * Every memory write also emits a signal to the WAL (write-ahead log),
 * which workers (intake, librarian, chief) consume for dossier compilation
 * and domain profile synthesis.
 *
 * Design: best-effort, never throws, never blocks the caller.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { MemoryCategory } from '@/lib/memory-palace/types'
import type { SignalType, KnowledgeLogEntry, WALTailQuery } from './types'

// ─── Category -> Signal Type Mapping ────────────────────────────────────────

const CATEGORY_SIGNAL_MAP: Record<MemoryCategory, SignalType> = {
  conversation: 'message',
  decision: 'decision',
  pattern: 'pattern',
  fact: 'message',
  relationship: 'relationship',
  pricing: 'pricing',
  convention: 'pattern',
  fiduciary_constraint: 'fiduciary',
}

export function mapCategoryToSignalType(category: MemoryCategory): SignalType {
  return CATEGORY_SIGNAL_MAP[category]
}

// ─── WAL Emit ───────────────────────────────────────────────────────────────

interface EmitParams {
  org_id: string
  entity_ids: string[]
  signal_type: SignalType
  content: string
  confidence: number
  source_memory_id?: string | null
  source_thread_id?: string | null
}

/**
 * Append a signal to the knowledge_log WAL.
 * Returns the created entry on success, null on any failure.
 * NEVER throws.
 */
export async function emitToWAL(
  supabase: SupabaseClient,
  params: EmitParams,
): Promise<KnowledgeLogEntry | null> {
  try {
    const row = {
      org_id: params.org_id,
      entity_ids: params.entity_ids,
      signal_type: params.signal_type,
      content: params.content,
      confidence: params.confidence,
      source_memory_id: params.source_memory_id ?? null,
      source_thread_id: params.source_thread_id ?? null,
    }

    const { data, error } = await supabase
      .from('knowledge_log')
      .insert(row)
      .select()
      .single()

    if (error) {
      logger.warn('[wal-emitter] Failed to emit WAL entry', {
        error: error.message,
        signal_type: params.signal_type,
        org_id: params.org_id,
      })
      return null
    }

    return data as KnowledgeLogEntry
  } catch (err) {
    logger.warn('[wal-emitter] Unexpected error emitting to WAL', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ─── WAL Tail Reader ────────────────────────────────────────────────────────

/**
 * Read unconsolidated entries from the WAL tail.
 * Returns newest-first, up to query.limit (default 20).
 */
export async function readWALTail(
  supabase: SupabaseClient,
  query: WALTailQuery,
): Promise<KnowledgeLogEntry[]> {
  try {
    let q = supabase
      .from('knowledge_log')
      .select('*')
      .eq('org_id', query.org_id)
      .is('consolidated_at', null)

    if (query.since) {
      q = q.gte('created_at', query.since)
    }

    q = q.order('created_at', { ascending: false })

    const { data, error } = await q.limit(query.limit ?? 20)

    if (error) {
      logger.warn('[wal-emitter] Failed to read WAL tail', {
        error: error.message,
        org_id: query.org_id,
      })
      return []
    }

    return (data ?? []) as KnowledgeLogEntry[]
  } catch (err) {
    logger.warn('[wal-emitter] Unexpected error reading WAL tail', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
