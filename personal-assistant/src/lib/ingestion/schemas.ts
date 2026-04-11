/**
 * Structured Ingestion Schemas
 *
 * Zod schemas for AI-powered structured extraction from channel messages.
 * Used with Vercel AI SDK `generateObject()` to produce typed, validated
 * data from every inbound message across 20+ channel adapters.
 *
 * @module ingestion/schemas
 */

import { z } from 'zod'

// ─── Message Classification ──────────────────────────────────────────────

/**
 * Classifies a message into a business category with urgency and
 * actionability signals. Used for routing, prioritization, and triage.
 */
export const MessageClassificationSchema = z.object({
  /** Primary business category */
  category: z.enum([
    'billing',
    'project_update',
    'client_request',
    'meeting',
    'lead',
    'support',
    'personal',
    'newsletter',
    'notification',
    'other',
  ]),
  /** Optional subcategory for finer-grained routing (e.g. "invoice_overdue", "bug_report") */
  subcategory: z.string().optional(),
  /** Confidence in the classification (0-1) */
  confidence: z.number().min(0).max(1),
  /** Whether this message requires action from someone */
  isActionable: z.boolean(),
  /** How urgently the message needs attention */
  urgency: z.enum(['critical', 'high', 'medium', 'low', 'none']),
  /** Suggested next actions the user or system should take */
  suggestedActions: z.array(z.string()).max(5).default([]),
})

export type MessageClassification = z.infer<typeof MessageClassificationSchema>

// ─── Entity Extraction ───────────────────────────────────────────────────

/** A person mentioned in the message */
const PersonEntitySchema = z.object({
  name: z.string(),
  role: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
})

/** An organisation mentioned in the message */
const OrganisationEntitySchema = z.object({
  name: z.string(),
  type: z.string().optional(),
})

/** A monetary amount mentioned in the message */
const MonetaryEntitySchema = z.object({
  amount: z.number(),
  currency: z.string().default('USD'),
  context: z.string().optional(),
})

/** A date or time reference in the message */
const DateEntitySchema = z.object({
  date: z.string(),
  context: z.string().optional(),
})

/** A reference number, ID, or external identifier */
const ReferenceEntitySchema = z.object({
  type: z.string(),
  value: z.string(),
})

/**
 * Structured entity extraction: people, organisations, money, dates, references.
 * Replaces the regex-based entity-extractor with AI-powered NER.
 */
export const EntityExtractionSchema = z.object({
  people: z.array(PersonEntitySchema).default([]),
  organisations: z.array(OrganisationEntitySchema).default([]),
  monetary: z.array(MonetaryEntitySchema).default([]),
  dates: z.array(DateEntitySchema).default([]),
  references: z.array(ReferenceEntitySchema).default([]),
})

export type EntityExtraction = z.infer<typeof EntityExtractionSchema>

// ─── Relationship Signals ────────────────────────────────────────────────

/**
 * Captures relationship dynamics: sentiment, intent, engagement level,
 * and risk/opportunity signals for relationship health tracking over time.
 */
export const RelationshipSignalSchema = z.object({
  /** Overall sentiment of the message on a 5-level scale */
  sentiment: z.enum(['very_positive', 'positive', 'neutral', 'negative', 'very_negative']),
  /** Primary intent of the sender */
  intent: z.enum([
    'request',
    'inform',
    'approve',
    'reject',
    'escalate',
    'thank',
    'complain',
    'follow_up',
    'other',
  ]),
  /** How engaged the sender appears (1=disengaged, 10=highly engaged) */
  engagementLevel: z.number().min(1).max(10),
  /** Warning signs that the relationship may be at risk */
  riskSignals: z.array(z.string()).default([]),
  /** Positive signals indicating growth or upsell opportunities */
  opportunitySignals: z.array(z.string()).default([]),
})

export type RelationshipSignal = z.infer<typeof RelationshipSignalSchema>

// ─── Message Summary ─────────────────────────────────────────────────────

/** An action item extracted from the message */
const ActionItemSchema = z.object({
  description: z.string(),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
})

/**
 * Structured summary: a one-liner, key bullet points, and action items.
 * Replaces the single-line Haiku summary from ingest-enrichment.ts.
 */
export const MessageSummarySchema = z.object({
  /** One-line summary, max 120 characters */
  oneLiner: z.string().max(120),
  /** Key points from the message (max 5) */
  keyPoints: z.array(z.string()).max(5).default([]),
  /** Extracted action items with optional assignee/due date */
  actionItems: z.array(ActionItemSchema).default([]),
})

export type MessageSummary = z.infer<typeof MessageSummarySchema>

// ─── Processing Metadata ─────────────────────────────────────────────────

/** Metadata about the ingestion process itself */
export const ProcessingMetadataSchema = z.object({
  /** Total wall-clock time for all extractions in milliseconds */
  processingTimeMs: z.number(),
  /** Estimated token cost across all LLM calls */
  tokenCost: z.number().default(0),
  /** Which model(s) were used */
  modelUsed: z.string(),
})

export type ProcessingMetadata = z.infer<typeof ProcessingMetadataSchema>

// ─── Ingestion Result (composite) ────────────────────────────────────────

/**
 * Complete ingestion result combining all four extraction dimensions
 * plus processing metadata. This is the canonical output of the
 * structured ingestion pipeline.
 */
export const IngestionResultSchema = z.object({
  classification: MessageClassificationSchema,
  entities: EntityExtractionSchema,
  relationships: RelationshipSignalSchema,
  summary: MessageSummarySchema,
  metadata: ProcessingMetadataSchema,
})

export type IngestionResult = z.infer<typeof IngestionResultSchema>
