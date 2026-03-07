import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/core/logger';

interface ReflectionFact {
  content: string
  category: 'preference' | 'pattern' | 'domain' | 'contact' | 'workflow'
  confidence: number
  entityIds: string[]
}

interface ReflectionInput {
  eventType: string
  eventData: Record<string, unknown>
  entityType?: string
  entityId?: string
  entityName?: string
}

const REFLECTION_PROMPT = `You are a memory extraction agent. Given an event, extract learnable facts that would be useful to remember for future interactions. Return ONLY valid JSON.

Rules:
- Only extract durable facts (preferences, patterns, relationships), not ephemeral state
- Each fact should be a single, clear statement
- Confidence: 0.9+ for explicit statements, 0.7-0.9 for strong inferences, 0.5-0.7 for weak inferences
- Categories: preference (likes/dislikes), pattern (recurring behavior), domain (business knowledge), contact (about a person), workflow (process preferences)
- Skip if nothing worth remembering

Event:
{EVENT_JSON}

Return JSON array (empty array if nothing to extract):
[
  {
    "content": "...",
    "category": "preference|pattern|domain|contact|workflow",
    "confidence": 0.5-1.0
  }
]`

function buildReflectionPrompt(input: ReflectionInput): string {
  const eventJson = JSON.stringify({
    type: input.eventType,
    data: input.eventData,
    entity: input.entityName
      ? { type: input.entityType, name: input.entityName }
      : undefined,
  }, null, 2)

  return REFLECTION_PROMPT.replace('{EVENT_JSON}', eventJson)
}

function parseReflectionResponse(text: string): Omit<ReflectionFact, 'entityIds'>[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  const parsed = JSON.parse(jsonMatch[0])
  if (!Array.isArray(parsed)) return []

  const validCategories = ['preference', 'pattern', 'domain', 'contact', 'workflow'] as const

  return parsed
    .filter((item: Record<string, unknown>) =>
      typeof item.content === 'string' &&
      item.content.length > 0 &&
      validCategories.includes(item.category as typeof validCategories[number])
    )
    .map((item: Record<string, unknown>) => ({
      content: String(item.content),
      category: item.category as ReflectionFact['category'],
      confidence: Math.max(0.5, Math.min(1.0, Number(item.confidence) || 0.7)),
    }))
}

/**
 * Check if a memory already exists (dedup by content similarity).
 */
async function memoryExists(
  supabase: SupabaseClient,
  orgId: string,
  content: string,
): Promise<boolean> {
  // Simple dedup: check for exact or near-exact match
  const { count } = await supabase
    .from('semantic_memories')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('is_active', true)
    .ilike('content', content)

  return (count ?? 0) > 0
}

/**
 * Extract learnable facts from a significant event using Haiku.
 * Writes new facts to semantic_memories. Deduplicates against existing memories.
 * Never throws — returns empty array on failure.
 */
export async function reflectOnEvent(
  supabase: SupabaseClient,
  orgId: string,
  input: ReflectionInput,
): Promise<ReflectionFact[]> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return []

    const client = new Anthropic()
    const prompt = buildReflectionPrompt(input)

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return []

    const extracted = parseReflectionResponse(textBlock.text)
    if (extracted.length === 0) return []

    const entityIds = input.entityId ? [input.entityId] : []
    const stored: ReflectionFact[] = []

    for (const fact of extracted) {
      // Dedup check
      if (await memoryExists(supabase, orgId, fact.content)) continue

      const { error } = await supabase
        .from('semantic_memories')
        .insert({
          org_id: orgId,
          content: fact.content,
          category: fact.category,
          confidence: fact.confidence,
          entity_ids: entityIds,
          source: 'reflection_agent',
          is_active: true,
        })

      if (!error) {
        stored.push({ ...fact, entityIds })
      }
    }

    return stored
  } catch (err) {
    logger.warn('[reflection] Failed to reflect on event:', err)
    return []
  }
}

// Exported for testing
export { buildReflectionPrompt, parseReflectionResponse }
