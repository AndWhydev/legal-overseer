import type { SupabaseClient } from '@supabase/supabase-js'
import type { EntityType, TimelineEventType, EntityRef } from './types'
import { logger } from '@/lib/core/logger'
import { extractAndStoreMentions } from './mention-extractor'

/**
 * Write a timeline event to entity_timeline.
 * Fire-and-forget: logs errors but never throws.
 * Extracts and stores mentions for text-containing events.
 */
export async function writeTimelineEvent(
  supabase: SupabaseClient,
  orgId: string,
  entityType: EntityType,
  entityId: string,
  eventType: TimelineEventType,
  eventData: Record<string, unknown>,
  channelSource?: string,
  relatedEntity?: EntityRef
): Promise<void> {
  try {
    const { error } = await supabase.from('entity_timeline').insert({
      org_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      event_type: eventType,
      event_data: eventData,
      channel_source: channelSource ?? null,
      related_entity_type: relatedEntity?.type ?? null,
      related_entity_id: relatedEntity?.id ?? null,
    })

    if (error) {
      logger.error('[timeline-writer] Failed to write event:', error.message)
      return
    }

    // Extract mentions from text-containing events
    const textContentEvents: TimelineEventType[] = ['message_received', 'message_sent', 'note_added']
    if (textContentEvents.includes(eventType)) {
      const text = (eventData.text as string) ?? (eventData.content as string) ?? (eventData.message as string)
      if (text) {
        // Fire-and-forget mention extraction
        extractAndStoreMentions(supabase, orgId, entityType, entityId, text).catch(err => {
          logger.error('[timeline-writer] Error extracting mentions:', { error: err instanceof Error ? err.message : String(err) })
        })
      }
    }
  } catch (err) {
    logger.error('[timeline-writer] Unexpected error:', err)
  }
}

/** Write a task lifecycle event */
export async function writeTaskEvent(
  supabase: SupabaseClient,
  orgId: string,
  taskId: string,
  eventType: 'task_created' | 'task_updated' | 'task_completed',
  data: Record<string, unknown>
): Promise<void> {
  return writeTimelineEvent(supabase, orgId, 'task', taskId, eventType, data)
}

/** Write a contact lifecycle event */
export async function writeContactEvent(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  eventType: 'contact_created' | 'contact_updated',
  data: Record<string, unknown>
): Promise<void> {
  return writeTimelineEvent(supabase, orgId, 'contact', contactId, eventType, data)
}

/** Write an invoice lifecycle event */
export async function writeInvoiceEvent(
  supabase: SupabaseClient,
  orgId: string,
  invoiceId: string,
  eventType: 'invoice_created' | 'invoice_sent' | 'invoice_paid' | 'invoice_overdue',
  data: Record<string, unknown>
): Promise<void> {
  return writeTimelineEvent(supabase, orgId, 'invoice', invoiceId, eventType, data)
}

/** Write a channel message event */
export async function writeMessageEvent(
  supabase: SupabaseClient,
  orgId: string,
  messageId: string,
  direction: 'inbound' | 'outbound',
  channelSource: string,
  data: Record<string, unknown>,
  contactId?: string
): Promise<void> {
  const eventType: TimelineEventType = direction === 'inbound' ? 'message_received' : 'message_sent'
  const relatedEntity: EntityRef | undefined = contactId
    ? { type: 'contact', id: contactId }
    : undefined
  return writeTimelineEvent(supabase, orgId, 'channel_message', messageId, eventType, data, channelSource, relatedEntity)
}
