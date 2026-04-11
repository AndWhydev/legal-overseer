/**
 * Neural Graph Co-occurrence Extractor
 *
 * Extracts concepts from text and links them via Hebbian learning.
 * Uses existing node names as reference and extracts new noun phrases.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { findOrCreate, strengthenBatch } from './engine'

// ─── Cache for org node names (5 min TTL) ────────────────────────────────

interface NameCache {
  map: Map<string, string> // lowercase name -> entityId
  loadedAt: number
}

const NAME_CACHE_TTL_MS = 5 * 60 * 1000
const nameCache = new Map<string, NameCache>()

/**
 * Get all node names for an org (cached).
 * Returns Map<lowercaseName, entityId> including aliases.
 */
async function getOrgNodeNames(
  supabase: SupabaseClient,
  orgId: string
): Promise<Map<string, string>> {
  const cached = nameCache.get(orgId)
  if (cached && Date.now() - cached.loadedAt < NAME_CACHE_TTL_MS) {
    return cached.map
  }

  try {
    const { data } = await supabase
      .from('kg_nodes')
      .select('entity_id, name, aliases')
      .eq('org_id', orgId)

    const map = new Map<string, string>()

    if (data) {
      for (const row of data) {
        // Add name
        map.set(row.name.toLowerCase(), row.entity_id)

        // Add aliases
        if (row.aliases && Array.isArray(row.aliases)) {
          for (const alias of row.aliases) {
            map.set(alias.toLowerCase(), row.entity_id)
          }
        }
      }
    }

    nameCache.set(orgId, { map, loadedAt: Date.now() })
    return map
  } catch (err) {
    logger.error('[co-occurrence] getOrgNodeNames failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return new Map()
  }
}

// ─── Stop words & phrase extraction ──────────────────────────────────────

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'that',
  'the',
  'to',
  'was',
  'will',
  'with',
])

/**
 * Extract noun phrases (capitalized multi-word phrases) from text.
 * E.g., "Steve West", "Real Estate", "Website Design"
 */
function extractNounPhrases(text: string): string[] {
  const phrases: string[] = []

  // Simple pattern: capitalized word sequences
  const wordPattern = /\b[A-Z][a-z]*(?:\s+[A-Z][a-z]*)+\b/g
  const matches = text.match(wordPattern) ?? []

  for (const phrase of matches) {
    const words = phrase.split(/\s+/)
    // Filter out stop words
    const filtered = words.filter(w => !STOP_WORDS.has(w.toLowerCase()))
    if (filtered.length >= 2) {
      phrases.push(phrase)
    }
  }

  return phrases
}

/**
 * Extract and link concepts from text using co-occurrence Hebbian learning.
 *
 * 1. Find all existing node names in text
 * 2. Extract additional noun phrases
 * 3. Create nodes for new phrases (via findOrCreate)
 * 4. Link all pairs via strengthen (CO_OCCURS, Hebbian)
 */
export async function extractAndLink(
  supabase: SupabaseClient,
  orgId: string,
  text: string,
  messageContext?: {
    messageId?: string
    channel?: string
    sender?: string
  }
): Promise<string[]> {
  if (!text || text.length < 20) return []

  try {
    const concepts: string[] = []
    const entityIds: string[] = []

    // 1. Get existing node names for this org
    const nodeNames = await getOrgNodeNames(supabase, orgId)

    // 2. Find existing nodes mentioned in text
    for (const [name, entityId] of nodeNames.entries()) {
      // Case-insensitive search for name in text
      const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (regex.test(text)) {
        concepts.push(name)
        if (!entityIds.includes(entityId)) {
          entityIds.push(entityId)
        }
      }
    }

    // 3. Extract noun phrases that aren't already in the graph
    const nounPhrases = extractNounPhrases(text)
    for (const phrase of nounPhrases) {
      const phraseLower = phrase.toLowerCase()
      if (!nodeNames.has(phraseLower)) {
        concepts.push(phrase)
      }
    }

    // 4. Create nodes for new concepts via findOrCreate
    for (const concept of concepts) {
      const conceptLower = concept.toLowerCase()

      // Skip if already processed
      if (entityIds.includes(nodeNames.get(conceptLower) ?? '')) continue

      const entityId = await findOrCreate(supabase, orgId, concept, 'Concept', {
        aliases: [],
      })
      if (entityId && !entityIds.includes(entityId)) {
        entityIds.push(entityId)
      }
    }

    // 5. Link all pairs via Hebbian learning (co-occurrence)
    if (entityIds.length >= 2) {
      const pairs: [string, string][] = []
      for (let i = 0; i < entityIds.length; i++) {
        for (let j = i + 1; j < entityIds.length; j++) {
          pairs.push([entityIds[i], entityIds[j]])
        }
      }
      await strengthenBatch(supabase, orgId, pairs, 'CO_OCCURS')
    }

    logger.debug('[co-occurrence] Extracted and linked concepts', {
      orgId,
      conceptCount: concepts.length,
      entityCount: entityIds.length,
      messageId: messageContext?.messageId,
    })

    return entityIds
  } catch (err) {
    logger.error('[co-occurrence] extractAndLink failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Invalidate the name cache for an org (call after graph mutations)
 */
export function invalidateNameCache(orgId: string): void {
  nameCache.delete(orgId)
}
