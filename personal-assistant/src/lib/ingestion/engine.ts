/**
 * Structured Ingestion Engine
 *
 * Runs four AI-powered extractions in parallel on every channel message:
 *   1. Message Classification (Haiku — fast)
 *   2. Entity Extraction (Haiku — fast)
 *   3. Relationship Signals (Sonnet — nuanced)
 *   4. Message Summary (Sonnet — nuanced)
 *
 * Uses Vercel AI SDK `generateObject()` with Zod schemas for typed output.
 * Fire-and-forget safe: never throws, always returns a result.
 *
 * @module ingestion/engine
 */

import { generateObject } from 'ai'
import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import type { ChannelMessage } from '@/lib/channels/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MessageClassificationSchema,
  EntityExtractionSchema,
  RelationshipSignalSchema,
  MessageSummarySchema,
  type IngestionResult,
  type MessageClassification,
  type EntityExtraction,
  type RelationshipSignal,
  type MessageSummary,
} from './schemas'

// ─── Defaults (used when an extraction fails) ────────────────────────────

const DEFAULT_CLASSIFICATION: MessageClassification = {
  category: 'other',
  confidence: 0,
  isActionable: false,
  urgency: 'none',
  suggestedActions: [],
}

const DEFAULT_ENTITIES: EntityExtraction = {
  people: [],
  organisations: [],
  monetary: [],
  dates: [],
  references: [],
}

const DEFAULT_RELATIONSHIPS: RelationshipSignal = {
  sentiment: 'neutral',
  intent: 'other',
  engagementLevel: 5,
  riskSignals: [],
  opportunitySignals: [],
}

const DEFAULT_SUMMARY: MessageSummary = {
  oneLiner: 'Unable to summarize',
  keyPoints: [],
  actionItems: [],
}

// ─── Prompt Helpers ──────────────────────────────────────────────────────

/**
 * Build a context string from the ChannelMessage for LLM prompts.
 * Truncates body to prevent token overflow on very long messages.
 */
function buildMessageContext(message: ChannelMessage): string {
  const body = message.bodyFull ?? message.body
  const truncatedBody = body.length > 4000 ? body.slice(0, 4000) + '\n[...truncated]' : body
  const parts = [
    `Channel: ${message.channel}`,
    `Sender: ${message.sender}${message.senderEmail ? ` <${message.senderEmail}>` : ''}`,
    message.subject ? `Subject: ${message.subject}` : null,
    `Received: ${message.receivedAt instanceof Date ? message.receivedAt.toISOString() : String(message.receivedAt)}`,
    `---`,
    truncatedBody,
  ]
  return parts.filter(Boolean).join('\n')
}

// ─── Individual Extractors ───────────────────────────────────────────────

async function extractClassification(context: string): Promise<MessageClassification> {
  const { object } = await generateObject({
    model: models.fast,
    schema: MessageClassificationSchema,
    prompt: `Classify this business message. Determine category, urgency, whether it's actionable, and suggest next actions.\n\n${context}`,
  })
  return object
}

async function extractEntities(context: string): Promise<EntityExtraction> {
  const { object } = await generateObject({
    model: models.fast,
    schema: EntityExtractionSchema,
    prompt: `Extract all structured entities from this message: people (with roles, emails, phones), organisations, monetary amounts, dates/deadlines, and reference numbers (invoice IDs, PO numbers, ticket IDs, etc.).\n\n${context}`,
  })
  return object
}

async function extractRelationships(context: string): Promise<RelationshipSignal> {
  const { object } = await generateObject({
    model: models.balanced,
    schema: RelationshipSignalSchema,
    prompt: `Analyze the relationship dynamics in this message. Determine sentiment (5 levels from very_negative to very_positive), sender intent, engagement level (1-10), and identify any risk signals (churn indicators, frustration, delays) or opportunity signals (expansion interest, positive feedback, referral potential).\n\n${context}`,
  })
  return object
}

async function extractSummary(context: string): Promise<MessageSummary> {
  const { object } = await generateObject({
    model: models.balanced,
    schema: MessageSummarySchema,
    prompt: `Summarize this message concisely:\n- oneLiner: max 120 chars, captures the essence\n- keyPoints: up to 5 bullet points of what matters\n- actionItems: any tasks, requests, or follow-ups with assignee/due date if mentioned\n\n${context}`,
  })
  return object
}

// ─── Main Pipeline ───────────────────────────────────────────────────────

/**
 * Process a single ChannelMessage through the full structured ingestion pipeline.
 *
 * Runs all four extractions in parallel via Promise.allSettled.
 * Fire-and-forget safe: never throws, logs warnings on partial failures,
 * and returns sensible defaults for any extraction that fails.
 *
 * @param message - The channel message to process
 * @param _supabase - Supabase client (reserved for future use, e.g. org-specific prompt config)
 * @returns Typed IngestionResult with classification, entities, relationships, summary, and metadata
 */
export async function processMessage(
  message: ChannelMessage,
  _supabase: SupabaseClient,
): Promise<IngestionResult> {
  const startTime = performance.now()
  const context = buildMessageContext(message)

  // Run all four extractions in parallel — never reject, always settle
  const [classificationResult, entitiesResult, relationshipsResult, summaryResult] =
    await Promise.allSettled([
      extractClassification(context),
      extractEntities(context),
      extractRelationships(context),
      extractSummary(context),
    ])

  // Unwrap results with defaults for any failures
  const classification =
    classificationResult.status === 'fulfilled'
      ? classificationResult.value
      : (() => {
          logger.warn('[ingestion] Classification extraction failed', {
            messageId: message.id,
            error: classificationResult.reason instanceof Error
              ? classificationResult.reason.message
              : String(classificationResult.reason),
          })
          return DEFAULT_CLASSIFICATION
        })()

  const entities =
    entitiesResult.status === 'fulfilled'
      ? entitiesResult.value
      : (() => {
          logger.warn('[ingestion] Entity extraction failed', {
            messageId: message.id,
            error: entitiesResult.reason instanceof Error
              ? entitiesResult.reason.message
              : String(entitiesResult.reason),
          })
          return DEFAULT_ENTITIES
        })()

  const relationships =
    relationshipsResult.status === 'fulfilled'
      ? relationshipsResult.value
      : (() => {
          logger.warn('[ingestion] Relationship signal extraction failed', {
            messageId: message.id,
            error: relationshipsResult.reason instanceof Error
              ? relationshipsResult.reason.message
              : String(relationshipsResult.reason),
          })
          return DEFAULT_RELATIONSHIPS
        })()

  const summary =
    summaryResult.status === 'fulfilled'
      ? summaryResult.value
      : (() => {
          logger.warn('[ingestion] Summary extraction failed', {
            messageId: message.id,
            error: summaryResult.reason instanceof Error
              ? summaryResult.reason.message
              : String(summaryResult.reason),
          })
          return DEFAULT_SUMMARY
        })()

  const processingTimeMs = Math.round(performance.now() - startTime)

  // Count how many extractions succeeded vs used defaults
  const successCount = [classificationResult, entitiesResult, relationshipsResult, summaryResult]
    .filter((r) => r.status === 'fulfilled').length

  if (successCount < 4) {
    logger.warn('[ingestion] Partial extraction result', {
      messageId: message.id,
      successCount,
      processingTimeMs,
    })
  }

  return {
    classification,
    entities,
    relationships,
    summary,
    metadata: {
      processingTimeMs,
      tokenCost: 0, // Token cost tracking deferred to AI SDK usage callback integration
      modelUsed: `haiku+sonnet (${successCount}/4 succeeded)`,
    },
  }
}
