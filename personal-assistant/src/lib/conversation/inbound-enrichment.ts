/**
 * Inbound Channel Enrichment — intelligence-layer processing for all channels.
 *
 * Performs the steps that channel-triage (runTriage) does for email, but as a
 * lightweight, single-message function callable from real-time webhooks:
 *
 *   1. Entity resolution (sender -> contact)
 *   2. Timeline event writing (entity_timeline)
 *   3. Relationship linking (entity_relationships)
 *   4. Reflection extraction (learnable facts for significant messages)
 *
 * This ensures WhatsApp, SMS, and other channels get the same intelligence
 * enrichment that email gets through the triage pipeline.
 *
 * Fire-and-forget: all steps are non-fatal. Failures are logged but never
 * propagate to the caller — the primary message flow must not be blocked.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveEntityRanked } from '@/lib/context/entity-resolver'
import { writeMessageEvent } from '@/lib/context/timeline-writer'
import { linkRelationship } from '@/lib/context/relationship-linker'
import { reflectOnEvent } from '@/lib/agent/reflection'
import { logger } from '@/lib/core/logger'

export interface InboundEnrichmentParams {
  /** The ID of the channel_messages row (used for timeline + relationship) */
  messageId: string
  orgId: string
  channel: string
  /** Sender identifier: phone number for WhatsApp/SMS, email for email */
  senderIdentifier: string | null
  /** Display name of the sender */
  senderName: string | null
  /** Subject line (if any) */
  subject: string | null
  /** Message body text */
  body: string
  /** Priority level */
  priority: string
  /** Additional metadata for the timeline event */
  metadata?: Record<string, unknown>
}

export interface EnrichmentResult {
  contactId: string | null
  contactName: string | null
  timelineWritten: boolean
  relationshipLinked: boolean
  reflectionTriggered: boolean
}

/**
 * Enrich an inbound channel message with intelligence-layer processing.
 *
 * Call this AFTER inserting into channel_messages but BEFORE or IN PARALLEL
 * with the channel-specific processing (e.g., WhatsApp conversation manager).
 *
 * All steps are fire-and-forget — errors are logged but never thrown.
 */
export async function enrichInboundMessage(
  supabase: SupabaseClient,
  params: InboundEnrichmentParams,
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    contactId: null,
    contactName: null,
    timelineWritten: false,
    relationshipLinked: false,
    reflectionTriggered: false,
  }

  // ── 1. Entity Resolution ────────────────────────────────────────────
  // Resolve sender to a known contact via email/phone or name
  if (params.senderIdentifier || params.senderName) {
    const queries = [params.senderIdentifier, params.senderName].filter(Boolean) as string[]

    for (const query of queries) {
      try {
        const ranked = await resolveEntityRanked(supabase, query, params.orgId)
        if (ranked.length > 0 && ranked[0].matchConfidence >= 0.6) {
          result.contactId = ranked[0].contact.id
          result.contactName = ranked[0].contact.name
          break
        }
      } catch (err) {
        logger.warn('[inbound-enrichment] Entity resolution failed', {
          error: err instanceof Error ? err.message : String(err),
          query,
          orgId: params.orgId,
        })
      }
    }
  }

  // ── 2. Timeline Event ───────────────────────────────────────────────
  try {
    await writeMessageEvent(
      supabase,
      params.orgId,
      params.messageId,
      'inbound',
      params.channel,
      {
        sender: params.senderName,
        sender_identifier: params.senderIdentifier,
        subject: params.subject,
        priority: params.priority,
        body_preview: (params.body || '').slice(0, 200),
      },
      result.contactId ?? undefined,
    )
    result.timelineWritten = true
  } catch (err) {
    logger.warn('[inbound-enrichment] Timeline write failed', {
      error: err instanceof Error ? err.message : String(err),
      messageId: params.messageId,
    })
  }

  // ── 3. Relationship Linking ─────────────────────────────────────────
  if (result.contactId) {
    try {
      await linkRelationship(
        supabase,
        params.orgId,
        { type: 'channel_message', id: params.messageId },
        { type: 'contact', id: result.contactId },
        'related_to',
        {
          channel: params.channel,
          sender_identifier: params.senderIdentifier,
        },
      )
      result.relationshipLinked = true
    } catch (err) {
      logger.warn('[inbound-enrichment] Relationship linking failed', {
        error: err instanceof Error ? err.message : String(err),
        messageId: params.messageId,
        contactId: result.contactId,
      })
    }
  }

  // ── 4. Reflection (significant messages only) ───────────────────────
  // Only trigger for messages with enough content to be meaningful
  if (params.body && params.body.length > 20) {
    try {
      reflectOnEvent(supabase, params.orgId, {
        eventType: 'channel_message',
        eventData: {
          channel: params.channel,
          sender: params.senderName,
          subject: params.subject,
          body: params.body.slice(0, 500),
        },
        entityType: result.contactId ? 'contact' : undefined,
        entityId: result.contactId ?? undefined,
        entityName: result.contactName ?? undefined,
      }).catch(() => {}) // fire-and-forget, never block enrichment
      result.reflectionTriggered = true
    } catch {
      // Reflection is entirely optional — silently skip
    }
  }

  // ── 5. Update channel_messages with enrichment data ─────────────────
  if (result.contactId) {
    try {
      // Merge contact info into the message metadata (same pattern as triage)
      const { data: existingMsg } = await supabase
        .from('channel_messages')
        .select('metadata')
        .eq('id', params.messageId)
        .single()

      const existingMeta = (existingMsg?.metadata || {}) as Record<string, unknown>

      await supabase
        .from('channel_messages')
        .update({
          metadata: {
            ...existingMeta,
            contact_id: result.contactId,
            contact_name: result.contactName,
            enriched_at: new Date().toISOString(),
          },
        })
        .eq('id', params.messageId)
    } catch (err) {
      logger.warn('[inbound-enrichment] Metadata update failed', {
        error: err instanceof Error ? err.message : String(err),
        messageId: params.messageId,
      })
    }
  }

  logger.info('[inbound-enrichment] Enrichment complete', {
    messageId: params.messageId,
    channel: params.channel,
    contactResolved: !!result.contactId,
    timelineWritten: result.timelineWritten,
    relationshipLinked: result.relationshipLinked,
    reflectionTriggered: result.reflectionTriggered,
  })

  return result
}
