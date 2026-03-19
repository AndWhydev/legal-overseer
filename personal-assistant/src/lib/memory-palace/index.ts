/**
 * Memory Palace — BitBit's persistent, searchable, self-maintaining memory layer.
 *
 * The Memory Palace stores everything BitBit learns about entities, decisions,
 * patterns, and conventions. It provides:
 *
 * - Typed memories with confidence scoring and temporal decay
 * - Decision log with full reasoning chains
 * - Pattern detection with auto-promotion to memories
 * - Hybrid full-text + semantic search
 * - Proactive recall for context injection during conversations
 * - Pricing intelligence via invoice cross-referencing
 * - Conversation archaeology for narrative reconstruction
 * - GDPR-compliant entity forgetting
 *
 * @module memory-palace
 */

import { MemoryWriter } from './memory-writer'
import { MemorySearch } from './memory-search'
import { PricingIntelligence } from './pricing-intelligence'
import { ArchaeologyEngine } from './archaeology'

export { MemoryWriter }
export { MemorySearch }
export { ConsolidationPipeline } from './consolidation-pipeline'
export type { ConsolidationReport } from './consolidation-pipeline'
export { proactiveRecall, formatProactiveRecall } from './proactive-recall'
export type { ProactiveRecallResult } from './proactive-recall'
export { PricingIntelligence }
export { ArchaeologyEngine }
export { PatternDetector } from './pattern-detector'
export { ExtractionBridge } from './extraction-bridge'
export type { ExtractedFactInput, ExtractionBridgeResult } from './extraction-bridge'
export { getMemoryExtractor } from './extractor'

export type {
  // Core entry types
  MemoryPalaceEntry,
  MemoryCategory,
  DecayRate,
  MemorySource,

  // Decision types
  DecisionLogEntry,
  DecisionAlternative,
  DecisionDomain,
  DecisionImpact,
  DecisionStatus,

  // Pattern types
  MemoryPattern,
  PatternType,
  PatternStatus,

  // Search types
  MemorySearchOptions,
  MemorySearchResult,
  EntityRecallOptions,
  EntityRecallResult,
  MemoryTimelineEvent,

  // Input types
  StoreMemoryInput,
  StoreDecisionInput,

  // Stats & GDPR
  MemoryPalaceStats,
  ForgetResult,
} from './types'

// Alias for API route compatibility
export type MemoryType = import('./types').MemoryCategory

import type { SupabaseClient } from '@supabase/supabase-js'

/** Factory to create Memory Palace service instances */
export function createMemoryPalace(supabase: SupabaseClient, orgId: string) {
  const writer = new MemoryWriter(supabase)
  const search = new MemorySearch(supabase)
  const pricing = new PricingIntelligence(supabase)
  const archaeology = new ArchaeologyEngine(supabase)
  return {
    writer, search, pricing, archaeology, supabase, orgId,
    // Facade methods for API route compatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    searchMemories: (opts: any) => search.search(opts),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createMemory: (input: any) => writer.storeMemory(input),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createDecision: (input: any) => writer.storeDecision(input),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forgetEntity: (entityId: string) => supabase.rpc('forget_entity', { p_org_id: orgId, p_entity_id: entityId }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recordDecisionOutcome: (id: string, outcome: any) => supabase.from('memory_decisions').update({ outcome_summary: outcome.summary, status: outcome.status }).eq('id', id).eq('org_id', orgId),
    getStats: () => supabase.rpc('memory_palace_stats', { p_org_id: orgId }),
    getEntityMemories: (entityId: string, _opts?: unknown) => search.recallEntity({ orgId, entityId }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getDecisions: (opts?: any) => supabase.from('memory_decisions').select('*').eq('org_id', orgId).order('decided_at', { ascending: false }).limit(opts?.limit ?? 50),
    getMemory: (id: string) => supabase.from('memory_palace_entries').select('*').eq('id', id).eq('org_id', orgId).single(),
  }
}
