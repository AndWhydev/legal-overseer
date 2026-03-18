/**
 * Memory Palace — Type Definitions
 *
 * Typed institutional knowledge with confidence scoring,
 * provenance tracking, and entity linkage.
 */

// ─── Memory Types ───────────────────────────────────────────────────────────

export type MemoryType =
  | 'conversation'
  | 'decision'
  | 'pattern'
  | 'fact'
  | 'relationship'
  | 'pricing'
  | 'lesson_learned'

export type SourceType =
  | 'extraction'
  | 'user_explicit'
  | 'agent_reflection'
  | 'consolidation'
  | 'import'

export type DecayRate = 'never' | 'slow' | 'normal' | 'fast'

export type OutcomeStatus = 'pending' | 'successful' | 'failed' | 'revised' | 'unknown'

export type ConsolidationOperation = 'decay' | 'merge' | 'archive' | 'corroborate' | 'forget_entity'

// ─── Type-Specific Metadata ─────────────────────────────────────────────────

export interface ConversationMeta {
  topic: string
  summary: string
  key_points: string[]
}

export interface DecisionMeta {
  alternatives: Array<{ option: string; pros: string[]; cons: string[] }>
  reasoning_chain: string
  domain: string
}

export interface PatternMeta {
  pattern_type: string
  sample_count: number
  pattern_data: Record<string, unknown>
}

export interface FactMeta {
  fact_type: string // 'financial', 'contact_info', 'preference', 'status'
  verified: boolean
}

export interface RelationshipMeta {
  relationship_type: string // 'works_with', 'reports_to', 'client_of'
  parties: string[]
}

export interface PricingMeta {
  amount: number
  currency: string
  project_type: string
  scope: string
  hourly_rate?: number
  fixed_price?: boolean
}

export interface LessonLearnedMeta {
  context: string
  what_happened: string
  what_we_learned: string
  applies_to: string[]
}

export type TypeMetadata =
  | ConversationMeta
  | DecisionMeta
  | PatternMeta
  | FactMeta
  | RelationshipMeta
  | PricingMeta
  | LessonLearnedMeta
  | Record<string, unknown>

// ─── Database Records ───────────────────────────────────────────────────────

export interface MemoryEntryRow {
  id: string
  org_id: string
  memory_type: MemoryType
  title: string
  content: string
  type_metadata: Record<string, unknown>
  confidence: number
  decay_rate: DecayRate
  corroboration_count: number
  last_corroborated_at: string | null
  source_type: SourceType
  source_thread_id: string | null
  source_message_ids: string[]
  source_channel: string | null
  entity_ids: string[]
  entity_names: string[]
  is_active: boolean
  superseded_by: string | null
  archived_at: string | null
  archive_reason: string | null
  occurred_at: string
  created_at: string
  updated_at: string
}

export interface MemoryDecisionRow {
  id: string
  org_id: string
  memory_entry_id: string
  decision_summary: string
  alternatives: Array<{ option: string; pros: string[]; cons: string[] }>
  reasoning_chain: string
  participants: string[]
  domain: string | null
  outcome_status: OutcomeStatus
  outcome_notes: string | null
  outcome_recorded_at: string | null
  lesson_learned: string | null
  decided_at: string
  created_at: string
  updated_at: string
}

export interface ConsolidationLogRow {
  id: string
  org_id: string
  operation: ConsolidationOperation
  affected_memory_ids: string[]
  details: Record<string, unknown>
  created_at: string
}

// ─── Service Input Types ────────────────────────────────────────────────────

export interface CreateMemoryInput {
  memoryType: MemoryType
  title: string
  content: string
  typeMetadata?: TypeMetadata
  confidence?: number
  decayRate?: DecayRate
  sourceType?: SourceType
  sourceThreadId?: string
  sourceMessageIds?: string[]
  sourceChannel?: string
  entityIds?: string[]
  entityNames?: string[]
  occurredAt?: string
}

export interface CreateDecisionInput {
  decisionSummary: string
  content: string
  alternatives?: Array<{ option: string; pros: string[]; cons: string[] }>
  reasoningChain?: string
  participants?: string[]
  domain?: string
  entityIds?: string[]
  entityNames?: string[]
  sourceThreadId?: string
  decidedAt?: string
}

export interface SearchMemoryInput {
  query: string
  memoryType?: MemoryType
  entityId?: string
  minConfidence?: number
  limit?: number
  dateFrom?: string
  dateTo?: string
}

export interface SearchMemoryResult {
  id: string
  memoryType: MemoryType
  title: string
  content: string
  confidence: number
  entityIds: string[]
  entityNames: string[]
  occurredAt: string
  sourceType: SourceType
  typeMetadata: Record<string, unknown>
  rank: number
}

export interface MemoryStats {
  totalActive: number
  totalArchived: number
  byType: Record<MemoryType, number>
  avgConfidence: number
  confidenceDistribution: {
    high: number    // > 0.7
    medium: number  // 0.3 - 0.7
    low: number     // < 0.3
  }
  recentDecisions: number
  oldestMemory: string | null
  newestMemory: string | null
}

export interface ForgetResult {
  deletedMemories: number
  updatedMemories: number
  deletedDecisions: number
}
