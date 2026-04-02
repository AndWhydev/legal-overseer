/**
 * Structured Channel Ingestion Pipeline
 *
 * AI-powered extraction system that processes every channel message through:
 * 1. Message Classification (category, urgency, actionability)
 * 2. Entity Extraction (people, orgs, money, dates, references)
 * 3. Relationship Signal Analysis (sentiment, intent, risk/opportunity)
 * 4. Structured Summary (one-liner, key points, action items)
 *
 * @module ingestion
 *
 * @example
 * ```typescript
 * import { processMessage, resolveContacts, writeToGraph, runPipeline } from '@/lib/ingestion'
 *
 * // Full pipeline (recommended)
 * const result = await runPipeline(message, orgId, supabase)
 *
 * // Or step-by-step
 * const ingestion = await processMessage(message, supabase)
 * const contacts = await resolveContacts(ingestion.entities, orgId, supabase)
 * await writeToGraph(ingestion, message.id, orgId, message.sender, supabase)
 * ```
 */

// Schemas & types
export {
  MessageClassificationSchema,
  EntityExtractionSchema,
  RelationshipSignalSchema,
  MessageSummarySchema,
  ProcessingMetadataSchema,
  IngestionResultSchema,
  type MessageClassification,
  type EntityExtraction,
  type RelationshipSignal,
  type MessageSummary,
  type ProcessingMetadata,
  type IngestionResult,
} from './schemas'

// Engine
export { processMessage } from './engine'

// Contact resolver
export {
  resolveContacts,
  type ResolvedContact,
  type UnresolvedEntity,
  type ResolvedContacts,
} from './contact-resolver'

// Graph writer
export { writeToGraph } from './graph-writer'

// Adapters
export {
  runPipeline,
  runPipelineBatch,
  prepareContent,
  messageLabel,
  type PipelineResult,
} from './adapters'
