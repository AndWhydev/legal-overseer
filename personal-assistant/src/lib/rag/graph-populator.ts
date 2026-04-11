/**
 * Knowledge Graph Populator
 *
 * Bridges entity extraction results → knowledge graph writes.
 * Called fire-and-forget during the embedding pipeline and channel triage.
 * All writes are non-blocking and failure-tolerant.
 */

import { logger } from '@/lib/core/logger'
import { getKnowledgeGraph } from './knowledge-graph'
import type { ExtractionResult } from './entity-extractor'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { extractAndLink } from '@/lib/neural-graph/co-occurrence'

/** Derive a deterministic topic ID from subject text */
function topicId(subject: string): string {
  return createHash('sha256').update(subject.toLowerCase().trim()).digest('hex').slice(0, 32)
}

/**
 * Populate the knowledge graph from entity extraction results.
 *
 * Creates/updates nodes for discovered people, organizations, and topics,
 * then creates edges linking entities to the message context.
 *
 * @param extraction Result from extractEntities()
 * @param orgId Organization scope
 * @param supabase Supabase client (service-role or user-scoped)
 * @param messageContext Metadata about the source message
 */
export async function populateGraphFromExtraction(
  extraction: ExtractionResult,
  orgId: string,
  supabase: SupabaseClient,
  messageContext: {
    messageId: string
    channel: string
    senderId?: string
    senderName?: string
    recipientId?: string
    subject?: string
    timestamp?: string
  }
): Promise<void> {
  if (extraction.mentions.length === 0) return

  const graph = getKnowledgeGraph(supabase, orgId)
  const now = messageContext.timestamp ?? new Date().toISOString()

  // Collect discovered entity IDs for edge creation
  const personIds: string[] = []
  const orgIds: string[] = []
  const topicIds: string[] = []

  // Phase 1: Upsert nodes for discovered entities
  for (const mention of extraction.mentions) {
    try {
      switch (mention.type) {
        case 'person': {
          const id = mention.contactId ?? `ext:${mention.normalized ?? mention.value}`
          await graph.upsertPerson({
            id,
            name: mention.normalized ?? mention.value,
            org_id: orgId,
            created_at: now,
          })
          personIds.push(id)
          break
        }
        case 'organization': {
          const id = mention.contactId ?? `ext:${mention.normalized ?? mention.value}`
          await graph.upsertOrganization({
            id,
            name: mention.value,
            org_id: orgId,
            created_at: now,
          })
          orgIds.push(id)
          break
        }
        case 'email': {
          // If cross-referenced to a contact, ensure they're in the graph
          if (mention.contactId) {
            await graph.upsertPerson({
              id: mention.contactId,
              name: mention.value, // will be overwritten by real name on next upsert
              email: mention.normalized,
              org_id: orgId,
              created_at: now,
            })
            personIds.push(mention.contactId)
          }
          break
        }
        case 'phone': {
          if (mention.contactId) {
            await graph.upsertPerson({
              id: mention.contactId,
              name: mention.value,
              phone: mention.normalized,
              org_id: orgId,
              created_at: now,
            })
            personIds.push(mention.contactId)
          }
          break
        }
        // money, date, reference — not graph-worthy as standalone nodes
        default:
          break
      }
    } catch (err) {
      logger.debug('[graph-populator] Node upsert failed (non-critical)', {
        type: mention.type,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Phase 2: Derive topic from message subject or content keywords
  if (messageContext.subject) {
    const tId = topicId(messageContext.subject)
    try {
      await graph.upsertTopic({
        id: tId,
        name: messageContext.subject,
        org_id: orgId,
        first_seen: now,
        last_seen: now,
      })
      topicIds.push(tId)
    } catch (err) {
      logger.debug('[graph-populator] Topic upsert failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  // Phase 3: Create edges

  // MENTIONED_IN: link discovered entities to topic
  for (const topicId of topicIds) {
    for (const entityId of [...personIds, ...orgIds]) {
      graph.addMention(entityId, topicId, messageContext.messageId, messageContext.channel, now)
        .catch(() => {}) // fire-and-forget
    }
  }

  // CONTACTED_BY: link sender to all mentioned people
  if (messageContext.senderId) {
    // Ensure sender is in the graph
    if (messageContext.senderName) {
      await graph.upsertPerson({
        id: messageContext.senderId,
        name: messageContext.senderName,
        org_id: orgId,
        created_at: now,
      }).catch(() => {})
    }

    for (const personId of personIds) {
      if (personId !== messageContext.senderId) {
        graph.addContact(messageContext.senderId, personId, messageContext.channel, 1, now)
          .catch(() => {}) // fire-and-forget
      }
    }

    // Also link sender to recipient if known
    if (messageContext.recipientId && messageContext.recipientId !== messageContext.senderId) {
      graph.addContact(messageContext.senderId, messageContext.recipientId, messageContext.channel, 1, now)
        .catch(() => {}) // fire-and-forget
    }
  }

  logger.debug('[graph-populator] Graph populated', {
    orgId,
    messageId: messageContext.messageId,
    nodes: { persons: personIds.length, orgs: orgIds.length, topics: topicIds.length },
  })

  // Phase 4: Neural co-occurrence extraction
  // Extract concepts from message and link via Hebbian learning
  try {
    const messageText = [messageContext.subject].filter(Boolean).join(' ')
    if (messageText.length > 20) {
      await extractAndLink(supabase, orgId, messageText, {
        messageId: messageContext.messageId,
        channel: messageContext.channel,
        sender: messageContext.senderName,
      })
    }
  } catch (err) {
    logger.debug('[graph-populator] Co-occurrence extraction failed (non-critical):', err instanceof Error ? err.message : String(err))
  }
}
