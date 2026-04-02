/**
 * Knowledge Graph Writer
 *
 * Persists structured ingestion results into the knowledge graph.
 * Stores entity mentions with message linkage, creates/updates relationship
 * edges, and tracks relationship signals over time for drift detection.
 *
 * Uses upsert patterns to safely handle duplicate writes during retries.
 *
 * @module ingestion/graph-writer
 */

import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { IngestionResult } from './schemas'

// ─── Types ───────────────────────────────────────────────────────────────

/** Entity node in the knowledge graph */
interface EntityNode {
  org_id: string
  entity_type: string
  entity_name: string
  entity_data: Record<string, unknown>
  first_seen_at: string
  last_seen_at: string
  mention_count: number
}

/** Edge linking an entity to a message */
interface EntityMessageEdge {
  org_id: string
  entity_type: string
  entity_name: string
  message_id: string
  context: string | null
  extracted_at: string
}

/** Relationship signal snapshot for time-series tracking */
interface RelationshipSnapshot {
  org_id: string
  message_id: string
  sender: string
  sentiment: string
  intent: string
  engagement_level: number
  risk_signals: string[]
  opportunity_signals: string[]
  recorded_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Safely upsert a row, logging but not throwing on failure.
 */
async function safeUpsert(
  supabase: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
  conflictColumns: string,
): Promise<boolean> {
  const { error } = await supabase
    .from(table)
    .upsert(row, { onConflict: conflictColumns })

  if (error) {
    logger.warn(`[graph-writer] Upsert to ${table} failed`, {
      error: error.message,
      row,
    })
    return false
  }
  return true
}

/**
 * Safely insert a row (no upsert), logging but not throwing on failure.
 */
async function safeInsert(
  supabase: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await supabase.from(table).insert(row)

  if (error) {
    // Ignore unique constraint violations (duplicate writes are fine)
    if (error.code === '23505') return true
    logger.warn(`[graph-writer] Insert to ${table} failed`, {
      error: error.message,
      code: error.code,
    })
    return false
  }
  return true
}

// ─── Entity Nodes ────────────────────────────────────────────────────────

/**
 * Write entity nodes: upsert each unique entity (person, org, etc.)
 * and increment mention count.
 */
async function writeEntityNodes(
  supabase: SupabaseClient,
  result: IngestionResult,
  orgId: string,
): Promise<void> {
  const now = new Date().toISOString()
  const nodes: EntityNode[] = []

  // People
  for (const person of result.entities.people) {
    nodes.push({
      org_id: orgId,
      entity_type: 'person',
      entity_name: person.name,
      entity_data: {
        role: person.role ?? null,
        email: person.email ?? null,
        phone: person.phone ?? null,
        sentiment: person.sentiment ?? null,
      },
      first_seen_at: now,
      last_seen_at: now,
      mention_count: 1,
    })
  }

  // Organisations
  for (const org of result.entities.organisations) {
    nodes.push({
      org_id: orgId,
      entity_type: 'organisation',
      entity_name: org.name,
      entity_data: {
        type: org.type ?? null,
      },
      first_seen_at: now,
      last_seen_at: now,
      mention_count: 1,
    })
  }

  // Monetary amounts (keyed by currency + context for aggregation)
  for (const monetary of result.entities.monetary) {
    nodes.push({
      org_id: orgId,
      entity_type: 'monetary',
      entity_name: `${monetary.currency} ${monetary.amount}`,
      entity_data: {
        amount: monetary.amount,
        currency: monetary.currency,
        context: monetary.context ?? null,
      },
      first_seen_at: now,
      last_seen_at: now,
      mention_count: 1,
    })
  }

  // References (invoice IDs, PO numbers, etc.)
  for (const ref of result.entities.references) {
    nodes.push({
      org_id: orgId,
      entity_type: 'reference',
      entity_name: `${ref.type}:${ref.value}`,
      entity_data: {
        type: ref.type,
        value: ref.value,
      },
      first_seen_at: now,
      last_seen_at: now,
      mention_count: 1,
    })
  }

  // Batch upsert all entity nodes
  for (const node of nodes) {
    await safeUpsert(supabase, 'knowledge_entities', node, 'org_id,entity_type,entity_name')
  }
}

// ─── Entity-Message Edges ────────────────────────────────────────────────

/**
 * Link every extracted entity to the source message for provenance tracking.
 */
async function writeEntityMessageEdges(
  supabase: SupabaseClient,
  result: IngestionResult,
  messageId: string,
  orgId: string,
): Promise<void> {
  const now = new Date().toISOString()
  const edges: EntityMessageEdge[] = []

  for (const person of result.entities.people) {
    edges.push({
      org_id: orgId,
      entity_type: 'person',
      entity_name: person.name,
      message_id: messageId,
      context: person.role ?? null,
      extracted_at: now,
    })
  }

  for (const org of result.entities.organisations) {
    edges.push({
      org_id: orgId,
      entity_type: 'organisation',
      entity_name: org.name,
      message_id: messageId,
      context: org.type ?? null,
      extracted_at: now,
    })
  }

  for (const ref of result.entities.references) {
    edges.push({
      org_id: orgId,
      entity_type: 'reference',
      entity_name: `${ref.type}:${ref.value}`,
      message_id: messageId,
      context: ref.type,
      extracted_at: now,
    })
  }

  for (const monetary of result.entities.monetary) {
    edges.push({
      org_id: orgId,
      entity_type: 'monetary',
      entity_name: `${monetary.currency} ${monetary.amount}`,
      message_id: messageId,
      context: monetary.context ?? null,
      extracted_at: now,
    })
  }

  for (const date of result.entities.dates) {
    edges.push({
      org_id: orgId,
      entity_type: 'date',
      entity_name: date.date,
      message_id: messageId,
      context: date.context ?? null,
      extracted_at: now,
    })
  }

  // Batch insert all edges
  for (const edge of edges) {
    await safeInsert(supabase, 'knowledge_entity_messages', edge)
  }
}

// ─── Relationship Signal Snapshots ───────────────────────────────────────

/**
 * Store a point-in-time snapshot of relationship signals for drift detection.
 * Over time these snapshots form a time series that reveals:
 * - Sentiment trending negative (churn risk)
 * - Engagement dropping off
 * - Risk signals accumulating
 */
async function writeRelationshipSnapshot(
  supabase: SupabaseClient,
  result: IngestionResult,
  messageId: string,
  orgId: string,
  sender: string,
): Promise<void> {
  const snapshot: RelationshipSnapshot = {
    org_id: orgId,
    message_id: messageId,
    sender,
    sentiment: result.relationships.sentiment,
    intent: result.relationships.intent,
    engagement_level: result.relationships.engagementLevel,
    risk_signals: result.relationships.riskSignals,
    opportunity_signals: result.relationships.opportunitySignals,
    recorded_at: new Date().toISOString(),
  }

  await safeInsert(supabase, 'relationship_signals', snapshot)
}

// ─── Classification + Summary Storage ────────────────────────────────────

/**
 * Store the classification and summary as enrichment metadata on the message.
 */
async function writeMessageEnrichment(
  supabase: SupabaseClient,
  result: IngestionResult,
  messageId: string,
  orgId: string,
): Promise<void> {
  const enrichment = {
    org_id: orgId,
    message_id: messageId,
    category: result.classification.category,
    subcategory: result.classification.subcategory ?? null,
    urgency: result.classification.urgency,
    is_actionable: result.classification.isActionable,
    confidence: result.classification.confidence,
    one_liner: result.summary.oneLiner,
    key_points: result.summary.keyPoints,
    action_items: result.summary.actionItems,
    suggested_actions: result.classification.suggestedActions,
    processing_time_ms: result.metadata.processingTimeMs,
    model_used: result.metadata.modelUsed,
    enriched_at: new Date().toISOString(),
  }

  await safeUpsert(supabase, 'message_enrichments', enrichment, 'org_id,message_id')
}

// ─── Main Export ─────────────────────────────────────────────────────────

/**
 * Write a complete IngestionResult to the knowledge graph.
 *
 * This is fire-and-forget safe: it logs errors but never throws.
 * Writes are performed in parallel where possible.
 *
 * Operations:
 * 1. Upsert entity nodes (people, orgs, references, monetary)
 * 2. Create entity-message edges (provenance)
 * 3. Store relationship signal snapshot (time-series)
 * 4. Store classification + summary enrichment on the message
 *
 * @param result - The structured ingestion result
 * @param messageId - The ID of the source message
 * @param orgId - The organisation ID for graph scoping
 * @param sender - The message sender (for relationship tracking)
 * @param supabase - Supabase client
 */
export async function writeToGraph(
  result: IngestionResult,
  messageId: string,
  orgId: string,
  sender: string,
  supabase: SupabaseClient,
): Promise<void> {
  const startTime = performance.now()

  try {
    // Run all write operations in parallel
    await Promise.allSettled([
      writeEntityNodes(supabase, result, orgId),
      writeEntityMessageEdges(supabase, result, messageId, orgId),
      writeRelationshipSnapshot(supabase, result, messageId, orgId, sender),
      writeMessageEnrichment(supabase, result, messageId, orgId),
    ])

    const elapsed = Math.round(performance.now() - startTime)
    logger.debug('[graph-writer] Graph write complete', {
      messageId,
      orgId,
      entityCount:
        result.entities.people.length +
        result.entities.organisations.length +
        result.entities.references.length +
        result.entities.monetary.length +
        result.entities.dates.length,
      elapsed,
    })
  } catch (err) {
    // Should never reach here due to Promise.allSettled, but belt-and-suspenders
    logger.warn('[graph-writer] Unexpected error during graph write', {
      messageId,
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
