// Barrel export for semantic context engine

// Entity resolution
export { resolveEntity, resolveEntityRanked } from './entity-resolver'
export type { RankedContact } from './entity-resolver'

// Relationship linking
export {
  linkRelationship,
  linkTaskToContact,
  linkInvoiceToContact,
  linkTaskToGoal,
} from './relationship-linker'

// Timeline writing
export {
  writeTimelineEvent,
  writeTaskEvent,
  writeContactEvent,
  writeInvoiceEvent,
  writeMessageEvent,
} from './timeline-writer'

// Context assembly
export { assembleContext, assembleEntityBriefing } from './assembler'

// Cross-reference
export {
  crossReference,
  getRelatedTasks,
  getFinancialSignals,
  getDeadlines,
} from './cross-reference'

// Context loader
export { loadContext } from './loader'
export type { AppContext } from './loader'

// Graph queries
export { getEntityGraph, searchEntities } from './graph-query'
export type { GraphNode, GraphEdge, EntityGraph, SearchResult } from './graph-query'

// Types
export type {
  EntityType,
  RelationshipType,
  TimelineEventType,
  EntityRef,
  RelationshipEdge,
  TimelineEntry,
  MemoryEntry,
  ResolvedEntity,
  EntityBriefing,
  ContextBriefing,
  TaskRef,
  Deadline,
  FinancialSignal,
  WaitingFor,
  CrossReference,
} from './types'
