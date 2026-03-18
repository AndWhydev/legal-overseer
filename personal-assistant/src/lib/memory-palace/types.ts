/**
<<<<<<< HEAD
 * Memory Palace — Type Definitions
 *
 * Typed institutional knowledge with confidence scoring,
 * provenance tracking, and entity linkage.
 */

// ─── Memory Types ───────────────────────────────────────────────────────────

export type MemoryType =
=======
 * Memory Palace — Core type definitions.
 *
 * All types match the CHECK constraints in migrations 100-104.
 */

// ─── Memory Entry Types ─────────────────────────────────────────────────────

export type MemoryCategory =
>>>>>>> v1.5-marketing-launch
  | 'conversation'
  | 'decision'
  | 'pattern'
  | 'fact'
  | 'relationship'
  | 'pricing'
<<<<<<< HEAD
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
=======
  | 'convention'

export type DecayRate = 'never' | 'slow' | 'normal' | 'fast'

export type MemorySource =
  | 'auto'
  | 'user_explicit'
  | 'conversation_extraction'
  | 'pattern_detection'
  | 'consolidation'
  | 'reflection_agent'

export interface MemoryPalaceEntry {
  id: string
  org_id: string
  category: MemoryCategory
  title: string | null
  content: string
  confidence: number
  decay_rate: DecayRate
  last_decayed_at: string | null
  corroboration_count: number
  entity_ids: string[]
  entity_names: string[]
  source: MemorySource
  source_thread_id: string | null
  source_turn_number: number | null
  source_channel: string | null
  superseded_by: string | null
  is_active: boolean
  pinecone_id: string | null
  tags: string[]
  metadata: Record<string, unknown>
>>>>>>> v1.5-marketing-launch
  created_at: string
  updated_at: string
}

<<<<<<< HEAD
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
=======
// ─── Decision Log Types ─────────────────────────────────────────────────────

export type DecisionDomain =
  | 'pricing'
  | 'staffing'
  | 'tooling'
  | 'process'
  | 'client'
  | 'vendor'
  | 'general'

export type DecisionImpact = 'low' | 'medium' | 'high' | 'critical'
export type DecisionStatus = 'active' | 'superseded' | 'reversed' | 'archived'

export interface DecisionAlternative {
  option: string
  pros: string[]
  cons: string[]
}

export interface DecisionLogEntry {
  id: string
  org_id: string
  memory_id: string | null
  title: string
  decision: string
  alternatives: DecisionAlternative[]
  reasoning: string
  outcome: string | null
  lessons_learned: string | null
  entity_ids: string[]
  entity_names: string[]
  source_thread_id: string | null
  decided_by: string | null
  decided_at: string
  domain: DecisionDomain
  impact: DecisionImpact
  status: DecisionStatus
  superseded_by: string | null
  created_at: string
  updated_at: string
}

// ─── Memory Pattern Types ───────────────────────────────────────────────────

export type PatternType =
  | 'payment_timing'
  | 'response_latency'
  | 'scope_creep'
  | 'pricing_trend'
  | 'communication_style'
  | 'seasonal'
  | 'project_velocity'
  | 'escalation'
  | 'custom'

export type PatternStatus = 'active' | 'promoted' | 'invalidated' | 'archived'

export interface MemoryPattern {
  id: string
  org_id: string
  pattern_type: PatternType
  description: string
  pattern_data: Record<string, unknown>
  entity_ids: string[]
  entity_names: string[]
  sample_count: number
  confidence: number
  first_observed_at: string
  last_observed_at: string
  evidence_ids: string[]
  source_data: Record<string, unknown>
  promoted_to_memory_id: string | null
  promotion_threshold: number
  status: PatternStatus
  created_at: string
  updated_at: string
}

// ─── Search & Query Types ───────────────────────────────────────────────────

export interface MemorySearchOptions {
  query: string
  orgId: string
  category?: MemoryCategory
  entityId?: string
  limit?: number
  includeDecisions?: boolean
  includePatterns?: boolean
  minConfidence?: number
}

export interface MemorySearchResult {
  memories: (MemoryPalaceEntry & { rank: number })[]
  decisions: DecisionLogEntry[]
  patterns: MemoryPattern[]
  totalCount: number
}

export interface EntityRecallOptions {
  orgId: string
  entityId: string
  categories?: MemoryCategory[]
  limit?: number
  includeDecisions?: boolean
  includePatterns?: boolean
}

export interface EntityRecallResult {
  entityId: string
  entityName: string | null
  memories: MemoryPalaceEntry[]
  decisions: DecisionLogEntry[]
  patterns: MemoryPattern[]
  timeline: MemoryTimelineEvent[]
}

export interface MemoryTimelineEvent {
  id: string
  type: 'memory' | 'decision' | 'pattern'
  title: string
  content: string
  confidence: number
  category: string
  timestamp: string
  entityNames: string[]
}

// ─── Store Types ────────────────────────────────────────────────────────────

export interface StoreMemoryInput {
  orgId: string
  category: MemoryCategory
  title?: string
  content: string
  confidence?: number
  entityIds?: string[]
  entityNames?: string[]
  source?: MemorySource
  sourceThreadId?: string
  sourceTurnNumber?: number
  sourceChannel?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface StoreDecisionInput {
  orgId: string
  title: string
  decision: string
  alternatives?: DecisionAlternative[]
  reasoning: string
  entityIds?: string[]
  entityNames?: string[]
  sourceThreadId?: string
  decidedBy?: string
  domain?: DecisionDomain
  impact?: DecisionImpact
}

// ─── Stats Types ────────────────────────────────────────────────────────────

export interface MemoryPalaceStats {
  total_memories: number
  by_category: Partial<Record<MemoryCategory, number>>
  avg_confidence: number
  decisions_count: number
  patterns_count: number
  needing_decay: number
  low_confidence: number
}

// ─── Forget Types ───────────────────────────────────────────────────────────

export interface ForgetResult {
  entity_id: string
  memories_deleted: number
  decisions_deleted: number
  patterns_deleted: number
  timeline_deleted: number
  semantic_deleted: number
  forgotten_at: string
>>>>>>> v1.5-marketing-launch
}
