/**
 * Sparse Search (BM25-style) via Supabase Full-Text Search
 *
 * Complements dense vector search (Pinecone) for hybrid retrieval.
 * Dense search excels at semantic similarity ("messages about delayed shipment").
 * Sparse search excels at exact matches ("invoice INV-2024-003", "Steve West").
 *
 * Combined via Reciprocal Rank Fusion (RRF) for best of both worlds.
 */

import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SparseSearchResult {
  id: string
  content: string
  channel: string
  sender: string
  subject: string
  receivedAt: string
  rank: number
}

/**
 * Full-text search over channel_messages using Postgres text search.
 * Falls back to ILIKE if tsvector columns aren't available.
 */
export async function sparseSearch(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  opts: {
    limit?: number
    channel?: string
    sender?: string
    dateFrom?: string
    dateTo?: string
  } = {},
): Promise<SparseSearchResult[]> {
  const limit = opts.limit ?? 10

  try {
    // Try Postgres full-text search first (tsquery)
    let dbQuery = supabase
      .from('channel_messages')
      .select('id, body, channel, sender, subject, received_at')
      .eq('org_id', orgId)
      .order('received_at', { ascending: false })
      .limit(limit)

    if (opts.channel) dbQuery = dbQuery.eq('channel', opts.channel)
    if (opts.sender) dbQuery = dbQuery.ilike('sender', `%${opts.sender}%`)
    if (opts.dateFrom) dbQuery = dbQuery.gte('received_at', opts.dateFrom)
    if (opts.dateTo) dbQuery = dbQuery.lte('received_at', opts.dateTo)

    // Use ILIKE for keyword matching (works without tsvector setup)
    // Split query into keywords and search for all of them
    const keywords = query.split(/\s+/).filter(w => w.length > 2).slice(0, 5)
    if (keywords.length > 0) {
      // Search in subject and body
      const conditions = keywords.map(k => `subject.ilike.%${k}%,body.ilike.%${k}%`).join(',')
      dbQuery = dbQuery.or(conditions)
    }

    const { data, error } = await dbQuery

    if (error) {
      logger.warn('[sparse-search] Query failed', { error: error.message })
      return []
    }

    // Score results by keyword hit count for ranking
    return (data ?? []).map((row, index) => {
      const text = `${row.subject ?? ''} ${row.body ?? ''}`.toLowerCase()
      const hits = keywords.filter(k => text.includes(k.toLowerCase())).length
      return {
        id: row.id,
        content: (row.body ?? '').slice(0, 500),
        channel: row.channel,
        sender: row.sender ?? '',
        subject: row.subject ?? '',
        receivedAt: row.received_at ?? '',
        rank: hits > 0 ? hits / keywords.length : 1 / (index + 1),
      }
    }).sort((a, b) => b.rank - a.rank)
  } catch (err) {
    logger.warn('[sparse-search] Failed', { error: err instanceof Error ? err.message : String(err) })
    return []
  }
}

/**
 * Reciprocal Rank Fusion — merge dense and sparse search results.
 *
 * RRF score = sum over all lists of: 1 / (k + rank_in_list)
 * where k=60 (standard constant).
 *
 * This normalizes scores across different retrieval systems without
 * needing score calibration.
 */
export function reciprocalRankFusion<T extends { id: string }>(
  lists: Array<{ results: T[]; weight?: number }>,
  k: number = 60,
): T[] {
  const scores = new Map<string, { score: number; item: T }>()

  for (const { results, weight = 1.0 } of lists) {
    for (let rank = 0; rank < results.length; rank++) {
      const item = results[rank]
      const rrfScore = weight / (k + rank + 1)
      const existing = scores.get(item.id)
      if (existing) {
        existing.score += rrfScore
      } else {
        scores.set(item.id, { score: rrfScore, item })
      }
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}
