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
