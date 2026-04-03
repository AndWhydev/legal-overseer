/**
 * Dual Entity Embedding
 *
 * Embeds entity nodes using both Google (768d) and Voyage (1024d) models.
 * Updates the entity_nodes row with both embedding vectors.
 * Failures are non-fatal — missing embeddings simply mean no vector search.
 */

import { embedText } from '@/lib/rag/google-embedding-client'
import { embedDocuments } from '@/lib/rag/voyage-client'
import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EntityNode } from './types'

/**
 * Build a text representation of an entity node for embedding.
 */
function buildTextRepr(node: EntityNode): string {
  const parts: string[] = [`${node.entity_type}: ${node.name}`]
  const props = node.properties || {}

  if (props.email) parts.push(`email: ${props.email}`)
  if (props.emails && Array.isArray(props.emails) && props.emails.length > 0) {
    parts.push(`emails: ${(props.emails as string[]).join(', ')}`)
  }
  if (props.phone) parts.push(`phone: ${props.phone}`)
  if (props.phones && Array.isArray(props.phones) && props.phones.length > 0) {
    parts.push(`phones: ${(props.phones as string[]).join(', ')}`)
  }
  if (props.status) parts.push(`status: ${props.status}`)
  if (props.daily_summary) parts.push(String(props.daily_summary))

  return parts.join('. ')
}

/**
 * Embed a single Voyage text and return the 1024d vector.
 * Uses embedDocuments with a single-item array.
 */
async function getVoyageEmbedding(text: string): Promise<number[] | null> {
  try {
    const result = await embedDocuments([text])
    if (result && result.length > 0 && result[0].length === 1024) {
      return result[0]
    }
    return null
  } catch {
    return null
  }
}

/**
 * Embed an entity node with dual embeddings (Google 768d + Voyage 1024d)
 * and update the entity_nodes row.
 *
 * Never throws — all failures are logged and swallowed.
 */
export async function embedEntityNode(
  supabase: SupabaseClient,
  node: EntityNode,
): Promise<void> {
  try {
    const textRepr = buildTextRepr(node)

    // Dual embedding: Google (768d) + Voyage (1024d)
    const [googleEmb, voyageEmb] = await Promise.all([
      embedText(textRepr).catch(() => null),
      getVoyageEmbedding(textRepr).catch(() => null),
    ])

    const updates: Record<string, unknown> = {}

    // pgvector expects string format '[0.1, 0.2, ...]' for vector columns
    if (googleEmb && googleEmb.length === 768) {
      updates.embedding = `[${googleEmb.join(',')}]`
    }
    if (voyageEmb && voyageEmb.length === 1024) {
      updates.text_embedding = `[${voyageEmb.join(',')}]`
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('entity_nodes')
        .update(updates)
        .eq('id', node.id)

      if (error) {
        logger.warn('[embed-entity] Update failed', {
          nodeId: node.id,
          error: error.message,
        })
      } else {
        logger.debug('[embed-entity] Embedded entity', {
          nodeId: node.id,
          name: node.name,
          google: googleEmb ? googleEmb.length : 0,
          voyage: voyageEmb ? voyageEmb.length : 0,
        })
      }
    }
  } catch (err) {
    logger.warn('[embed-entity] Failed', {
      nodeId: node.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
