import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

export interface ExtractionMetadata {
  sender?: string
  channel?: string
  timestamp?: string
}

export interface ExtractionResult {
  entities: number
  edges: number
  events: number
}

/**
 * Extract entities, relationships, and events from text and populate the knowledge graph.
 * Never throws — returns zeros on any failure.
 */
export async function extractAndPopulateGraph(
  _supabase: SupabaseClient,
  _orgId: string,
  _text: string,
  _metadata: ExtractionMetadata
): Promise<ExtractionResult> {
  // Stub: not yet implemented
  return { entities: 0, edges: 0, events: 0 }
}
