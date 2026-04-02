/**
 * Ingestion Adapters
 *
 * Adapts existing ChannelMessage objects into the format expected by the
 * structured ingestion pipeline. Provides helpers for preparing message
 * content and extracting the org context needed for contact resolution
 * and graph writing.
 *
 * @module ingestion/adapters
 */

import type { ChannelMessage } from '@/lib/channels/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { processMessage } from './engine'
import { resolveContacts } from './contact-resolver'
import { writeToGraph } from './graph-writer'
import { logger } from '@/lib/core/logger'
import type { IngestionResult } from './schemas'
import type { ResolvedContacts } from './contact-resolver'

// ─── Types ───────────────────────────────────────────────────────────────

/** Full pipeline result including contact resolution */
export interface PipelineResult {
  ingestion: IngestionResult
  contacts: ResolvedContacts
  messageId: string
  orgId: string
  processingTimeMs: number
}

// ─── Content Preparation ─────────────────────────────────────────────────

/**
 * Prepare the message content for ingestion.
 * Prefers bodyFull (complete message) over body (preview/snippet).
 * Strips HTML tags if present and normalises whitespace.
 */
export function prepareContent(message: ChannelMessage): string {
  const raw = message.bodyFull ?? message.body
  // Strip HTML tags (common in email channels)
  const stripped = raw.replace(/<[^>]*>/g, ' ')
  // Collapse whitespace
  return stripped.replace(/\s+/g, ' ').trim()
}

/**
 * Get a display-friendly identifier for a message (for logging).
 */
export function messageLabel(message: ChannelMessage): string {
  const sender = message.sender.length > 30
    ? message.sender.slice(0, 27) + '...'
    : message.sender
  const subject = message.subject
    ? message.subject.length > 40
      ? message.subject.slice(0, 37) + '...'
      : message.subject
    : '(no subject)'
  return `[${message.channel}] ${sender}: ${subject}`
}

// ─── Full Pipeline Adapter ───────────────────────────────────────────────

/**
 * Run the complete structured ingestion pipeline on a ChannelMessage:
 *
 * 1. AI-powered extraction (classification, entities, relationships, summary)
 * 2. Contact resolution (match extracted people/orgs against contacts table)
 * 3. Knowledge graph persistence (entity nodes, edges, relationship signals)
 *
 * This is the primary integration point for the synthesizer to call.
 * Fire-and-forget safe: never throws.
 *
 * @param message - The channel message to process
 * @param orgId - The organisation ID
 * @param supabase - Supabase client
 * @returns PipelineResult or null if processing failed entirely
 */
export async function runPipeline(
  message: ChannelMessage,
  orgId: string,
  supabase: SupabaseClient,
): Promise<PipelineResult | null> {
  const startTime = performance.now()

  try {
    // Step 1: Structured AI extraction
    const ingestion = await processMessage(message, supabase)

    // Step 2: Contact resolution (parallel-safe, non-throwing)
    const contacts = await resolveContacts(ingestion.entities, orgId, supabase)

    // Step 3: Write to knowledge graph (fire-and-forget)
    writeToGraph(ingestion, message.id, orgId, message.sender, supabase).catch((err) => {
      logger.warn('[adapters] Graph write failed (fire-and-forget)', {
        messageId: message.id,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    const processingTimeMs = Math.round(performance.now() - startTime)

    logger.debug('[adapters] Pipeline complete', {
      label: messageLabel(message),
      category: ingestion.classification.category,
      urgency: ingestion.classification.urgency,
      entitiesFound:
        ingestion.entities.people.length +
        ingestion.entities.organisations.length,
      contactsResolved: contacts.resolved.length,
      contactsUnresolved: contacts.unresolved.length,
      processingTimeMs,
    })

    return {
      ingestion,
      contacts,
      messageId: message.id,
      orgId,
      processingTimeMs,
    }
  } catch (err) {
    logger.warn('[adapters] Pipeline failed entirely', {
      messageId: message.id,
      label: messageLabel(message),
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ─── Batch Processing ────────────────────────────────────────────────────

/**
 * Process multiple messages through the pipeline with concurrency control.
 * Default concurrency of 3 to balance throughput vs API rate limits.
 *
 * @param messages - Array of channel messages
 * @param orgId - The organisation ID
 * @param supabase - Supabase client
 * @param concurrency - Max parallel pipeline runs (default: 3)
 * @returns Array of results (null entries for failed messages)
 */
export async function runPipelineBatch(
  messages: ChannelMessage[],
  orgId: string,
  supabase: SupabaseClient,
  concurrency = 3,
): Promise<(PipelineResult | null)[]> {
  const results: (PipelineResult | null)[] = new Array(messages.length).fill(null)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < messages.length) {
      const index = cursor++
      results[index] = await runPipeline(messages[index], orgId, supabase)
    }
  }

  // Spawn workers up to concurrency limit
  const workers = Array.from(
    { length: Math.min(concurrency, messages.length) },
    () => worker(),
  )
  await Promise.allSettled(workers)

  return results
}
