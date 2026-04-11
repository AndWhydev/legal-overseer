/**
 * Memory Palace — Core type definitions.
 *
 * All types match the CHECK constraints in migrations 100-104.
 */

// ─── Memory Entry Types ─────────────────────────────────────────────────────

export type MemoryCategory =
  | 'conversation'
  | 'decision'
  | 'pattern'
  | 'fact'
  | 'relationship'
  | 'pricing'
  | 'convention'
  | 'fiduciary_constraint'

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
  created_at: string
  updated_at: string
}

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
}
