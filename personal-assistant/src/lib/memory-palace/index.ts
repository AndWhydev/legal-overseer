<<<<<<< HEAD
// Memory Palace — Institutional Knowledge System
// Barrel export

export { MemoryPalaceService, createMemoryPalace } from './service'
export { MemoryExtractor, getMemoryExtractor } from './extractor'
export { recallForContext } from './proactive-recall'
export { runMemoryMaintenance } from './maintenance'
export { MEMORY_PALACE_TOOLS, executeMemoryPalaceTool } from './agent-tools'

export type {
  MemoryType,
  SourceType,
  DecayRate,
  OutcomeStatus,
  ConsolidationOperation,
  MemoryEntryRow,
  MemoryDecisionRow,
  ConsolidationLogRow,
  CreateMemoryInput,
  CreateDecisionInput,
  SearchMemoryInput,
  SearchMemoryResult,
  MemoryStats,
  ForgetResult,
  ConversationMeta,
  DecisionMeta,
  PatternMeta,
  FactMeta,
  RelationshipMeta,
  PricingMeta,
  LessonLearnedMeta,
  TypeMetadata,
} from './types'

export type { RecalledMemory, ProactiveRecallResult } from './proactive-recall'
export type { MaintenanceResult } from './maintenance'
export type { ExtractionContext } from './extractor'
=======
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

export { MemoryWriter } from './memory-writer'
export { MemorySearch } from './memory-search'
export { ConsolidationPipeline } from './consolidation-pipeline'
export type { ConsolidationReport } from './consolidation-pipeline'
export { proactiveRecall, formatProactiveRecall } from './proactive-recall'
export type { ProactiveRecallResult } from './proactive-recall'
export { PricingIntelligence } from './pricing-intelligence'
export { ArchaeologyEngine } from './archaeology'
export { PatternDetector } from './pattern-detector'
export { ExtractionBridge } from './extraction-bridge'
export type { ExtractedFactInput, ExtractionBridgeResult } from './extraction-bridge'

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
>>>>>>> v1.5-marketing-launch
