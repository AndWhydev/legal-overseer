import type { SupabaseClient } from '@supabase/supabase-js'

export interface EntityNode {
  id: string
  org_id: string
  entity_type: 'person' | 'project' | 'company' | 'invoice' | 'channel' | 'community'
  name: string
  aliases: string[]
  properties: Record<string, unknown>
  embedding?: number[]
  text_embedding?: number[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface EntityEdge {
  id: string
  org_id: string
  source_id: string
  target_id: string
  relation_type: string
  properties: Record<string, unknown>
  valid_from: string
  valid_until: string | null
  ingested_at: string
  confidence: number
  source_memory_id: string | null
}

export interface EventTuple {
  id: string
  org_id: string
  subject_id: string
  verb: string
  object_text: string | null
  object_id: string | null
  occurred_at: string
  occurred_until: string | null
  source_memory_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface GraphNeighborhood {
  node: EntityNode
  edges: EntityEdge[]
  neighbors: EntityNode[]
}

export interface GraphSearchOptions {
  relationTypes?: string[]
  validAt?: string  // ISO date - only edges valid at this point in time
  limit?: number
  includeInactive?: boolean
}

export interface TimeRange {
  from?: string  // ISO date
  to?: string    // ISO date
}
