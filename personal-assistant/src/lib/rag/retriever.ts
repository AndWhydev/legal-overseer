/**
 * RAG Query Retriever
 *
 * Embeds search queries and retrieves relevant chunks from Pinecone.
 * Implements sandwich ranking and citation formatting.
 */

import { embedQuery, rerankDocuments } from './voyage-client'
import { queryPinecone } from './pinecone-client'
import { encodeQuerySparse } from './sparse-encoder'
import { logger } from '@/lib/core/logger'
import type { SearchOptions, RetrievedChunk } from './types'

/**
 * Format a date for citation references.
 */
function formatDateForCitation(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    })
  } catch {
    return isoDate
  }
}

/**
 * Apply sandwich ranking: place highest and lowest relevance at edges,
 * lower scores in the middle for better context window usage.
 */
function applySandwichRanking(
  chunks: Array<{ id: string; score: number; metadata: Record<string, unknown> }>
): Array<{ id: string; score: number; metadata: Record<string, unknown> }> {
  if (chunks.length <= 2) return chunks

  // Sort by score descending
  const sorted = [...chunks].sort((a, b) => b.score - a.score)

  // Interleave: highest at edges, lowest in middle
  // [1st, 3rd, 5th, ..., 6th, 4th, 2nd]
  const result: typeof sorted = []
  const mid: typeof sorted = []

  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0) {
      result.push(sorted[i]) // edges (front)
    } else {
      mid.unshift(sorted[i]) // middle (reversed, so 2nd-best ends up at end)
    }
  }

  return [...result, ...mid]
}

/**
 * Build a citation reference string from metadata.
 */
function buildCitationRef(metadata: Record<string, unknown>): string {
  const channel = (metadata.channel as string) || 'unknown'
  const sender = (metadata.sender as string) || 'unknown'
  const date = formatDateForCitation((metadata.received_at as string) || new Date().toISOString())

  return `[${channel}|${sender}|${date}]`
}

/**
 * Search for relevant chunks using hybrid search (dense + sparse vectors).
 *
 * Process:
 * 1. Embed the query using Voyage-3.5 (dense)
 * 2. Generate sparse vector from query (BM25-style keywords)
 * 3. Query Pinecone with hybrid search (over-fetch 3x for reranking)
 * 4. Apply optional reranking
 * 5. Apply sandwich ranking
 * 6. Return top-K results with citations
 */
export async function searchVectors(options: SearchOptions): Promise<RetrievedChunk[]> {
  const { query, orgId, topK = 10, channel, sender, dateFrom, dateTo } = options

  // Step 1: Embed the query (dense vector)
  const embedding = await embedQuery(query)
  if (!embedding) {
    logger.warn('[retriever] Failed to embed query', { query })
    return []
  }

  // Step 2: Generate sparse vector for hybrid search (keyword/BM25 matching)
  const sparseVector = encodeQuerySparse(query)

  // Step 3: Query Pinecone with hybrid search (over-fetch 3x for reranking)
  const fetchTopK = topK * 3
  const results = await queryPinecone(embedding, orgId, {
    topK: fetchTopK,
    channel,
    sender,
    dateFrom,
    dateTo,
    sparseVector: sparseVector.indices.length > 0 ? sparseVector : undefined,
    alpha: 0.7, // 70% weight on dense/semantic, 30% on sparse/keyword
  })

  if (results.length === 0) {
    logger.debug('[retriever] No results from Pinecone for query', { query })
    return []
  }

  // Step 4: Optional reranking (if Voyage API available)
  let ranked = results
  try {
    const documents = results.map((r) => ({
      id: r.id,
      text: (r.metadata.content as string) || `${r.metadata.sender || ''} ${r.metadata.subject || ''}`,
    }))

    const rerankResults = await rerankDocuments(query, documents, fetchTopK)
    if (rerankResults.length > 0) {
      const scoreMap = new Map(rerankResults.map((r) => [r.id, r.score]))
      ranked = results.map((r) => ({
        ...r,
        score: scoreMap.get(r.id) ?? r.score,
      }))
    }
  } catch (err) {
    logger.debug('[retriever] Reranking failed, using vector scores:', err)
  }

  // Step 5: Apply sandwich ranking
  const sandwiched = applySandwichRanking(ranked)

  // Step 6: Format and trim to topK — content is stored in Pinecone metadata
  const chunks: RetrievedChunk[] = sandwiched.slice(0, topK).map((result) => ({
    id: result.id,
    score: result.score,
    content: (result.metadata.content as string) || '',
    metadata: result.metadata as unknown as RetrievedChunk['metadata'],
    citationRef: buildCitationRef(result.metadata),
  }))

  return chunks
}

/**
 * Format retrieved chunks for inclusion in system prompt.
 *
 * Each chunk is formatted as:
 * [{channel} | {sender} | {date}]
 * {content}
 * ---
 *
 * Chunks should already be sandwich-ranked from searchVectors().
 */
export function formatChunksForContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return ''

  return chunks
    .map((chunk) => {
      const channel = chunk.metadata.channel || 'unknown'
      const sender = chunk.metadata.sender || 'unknown'
      const date = formatDateForCitation(chunk.metadata.received_at || new Date().toISOString())

      return `[${channel} | ${sender} | ${date}]\n${chunk.content}\n---`
    })
    .join('\n\n')
}
