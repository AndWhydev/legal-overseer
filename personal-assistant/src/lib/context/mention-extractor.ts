import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

interface ExtractedMention {
  mentionedEntityType: string
  mentionedEntityId: string
  context: string
  confidence: number
}

/**
 * Extract entity mentions from text and store them.
 * Called after timeline events are written.
 */
export async function extractAndStoreMentions(
  supabase: SupabaseClient,
  orgId: string,
  sourceEntityType: string,
  sourceEntityId: string,
  text: string
): Promise<void> {
  if (!text || text.length < 3) return

  // Find mentioned contacts by name/email in the text
  const { data: contacts, error: contactError } = await supabase
    .from('contacts')
    .select('id, name, emails')
    .eq('org_id', orgId)

  if (contactError || !contacts?.length) return

  const mentions: ExtractedMention[] = []
  const lowerText = text.toLowerCase()

  for (const contact of contacts) {
    // Check name mention
    if (contact.name && lowerText.includes(contact.name.toLowerCase())) {
      const idx = lowerText.indexOf(contact.name.toLowerCase())
      const contextStart = Math.max(0, idx - 30)
      const contextEnd = Math.min(text.length, idx + contact.name.length + 30)

      mentions.push({
        mentionedEntityType: 'contact',
        mentionedEntityId: contact.id,
        context: text.slice(contextStart, contextEnd),
        confidence: 0.8,
      })
    }

    // Check email mention
    const emails = contact.emails as string[] | null
    if (emails) {
      for (const email of emails) {
        if (lowerText.includes(email.toLowerCase())) {
          mentions.push({
            mentionedEntityType: 'contact',
            mentionedEntityId: contact.id,
            context: email,
            confidence: 0.95,
          })
          break // One email match is enough
        }
      }
    }
  }

  // Deduplicate by entity
  const seen = new Set<string>()
  const uniqueMentions = mentions.filter(m => {
    const key = `${m.mentionedEntityType}:${m.mentionedEntityId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (uniqueMentions.length === 0) return

  // Batch insert mentions
  const rows = uniqueMentions.map(m => ({
    org_id: orgId,
    source_entity_type: sourceEntityType,
    source_entity_id: sourceEntityId,
    mentioned_entity_type: m.mentionedEntityType,
    mentioned_entity_id: m.mentionedEntityId,
    mention_context: m.context,
    confidence: m.confidence,
    extracted_by: 'keyword',
  }))

  const { error } = await supabase
    .from('entity_mentions')
    .insert(rows)

  if (error) {
    logger.error('[mention-extractor] Failed to store mentions', { error: error.message })
  } else {
    logger.info('[mention-extractor] Stored mentions', { count: rows.length, source: `${sourceEntityType}:${sourceEntityId}` })
  }
}
