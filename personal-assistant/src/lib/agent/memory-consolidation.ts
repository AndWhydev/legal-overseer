import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

interface MemoryRow {
  id: string
  content: string
  category: string
  confidence: number
  entity_ids: string[]
  created_at: string
}

interface ConsolidationResult {
  merged: number
  deactivated: number
  kept: number
}

const CONSOLIDATION_PROMPT = `You are a memory consolidation agent. Given a set of memories about the same topic/entity, determine which should be kept, merged, or deactivated.

Rules:
- If two memories say the same thing, keep the newer one with higher confidence
- If a newer memory contradicts an older one, the newer one supersedes
- If memories are complementary, merge them into a single clearer statement
- Return ONLY valid JSON

Memories:
{MEMORIES_JSON}

Return JSON:
{
  "keep": ["id1", "id2"],
  "deactivate": ["id3"],
  "merge": [
    {
      "source_ids": ["id4", "id5"],
      "merged_content": "consolidated statement",
      "confidence": 0.85
    }
  ]
}`

/**
 * Consolidate memories for a specific entity or category.
 * Identifies duplicates, contradictions, and merge opportunities.
 * Runs periodically (e.g., daily) or after a batch of new memories.
 */
export async function consolidateMemories(
  supabase: SupabaseClient,
  orgId: string,
  options?: { entityId?: string; category?: string; dryRun?: boolean },
): Promise<ConsolidationResult> {
  const result: ConsolidationResult = { merged: 0, deactivated: 0, kept: 0 }

  if (!process.env.ANTHROPIC_API_KEY) return result

  // Load active memories scoped to entity or category
  let query = supabase
    .from('semantic_memories')
    .select('id, content, category, confidence, entity_ids, created_at')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50)

  if (options?.entityId) {
    query = query.contains('entity_ids', [options.entityId])
  }
  if (options?.category) {
    query = query.eq('category', options.category)
  }

  const { data: memories } = await query
  if (!memories || memories.length < 2) {
    result.kept = memories?.length ?? 0
    return result
  }

  // Group by category for consolidation
  const byCategory = new Map<string, MemoryRow[]>()
  for (const mem of memories as MemoryRow[]) {
    const group = byCategory.get(mem.category) ?? []
    group.push(mem)
    byCategory.set(mem.category, group)
  }

  const client = new Anthropic()

  for (const [, group] of byCategory) {
    if (group.length < 2) {
      result.kept += group.length
      continue
    }

    try {
      const memoriesJson = JSON.stringify(
        group.map(m => ({ id: m.id, content: m.content, confidence: m.confidence, created: m.created_at })),
        null,
        2,
      )

      const prompt = CONSOLIDATION_PROMPT.replace('{MEMORIES_JSON}', memoriesJson)

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = response.content.find(b => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        result.kept += group.length
        continue
      }

      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        result.kept += group.length
        continue
      }

      const decision = JSON.parse(jsonMatch[0])

      if (options?.dryRun) {
        result.kept += (decision.keep?.length ?? 0)
        result.deactivated += (decision.deactivate?.length ?? 0)
        result.merged += (decision.merge?.length ?? 0)
        continue
      }

      // Deactivate memories
      if (Array.isArray(decision.deactivate) && decision.deactivate.length > 0) {
        await supabase
          .from('semantic_memories')
          .update({ is_active: false, superseded_by: 'consolidation' })
          .in('id', decision.deactivate)
          .eq('org_id', orgId)
        result.deactivated += decision.deactivate.length
      }

      // Merge memories
      if (Array.isArray(decision.merge)) {
        for (const merge of decision.merge) {
          if (!merge.merged_content || !Array.isArray(merge.source_ids)) continue

          // Collect entity IDs from all source memories
          const sourceMemories = group.filter(m => merge.source_ids.includes(m.id))
          const allEntityIds = [...new Set(sourceMemories.flatMap(m => m.entity_ids ?? []))]

          // Create merged memory
          await supabase.from('semantic_memories').insert({
            org_id: orgId,
            content: merge.merged_content,
            category: sourceMemories[0]?.category ?? 'domain',
            confidence: merge.confidence ?? 0.85,
            entity_ids: allEntityIds,
            source: 'consolidation',
            is_active: true,
          })

          // Deactivate source memories
          await supabase
            .from('semantic_memories')
            .update({ is_active: false, superseded_by: 'consolidation_merge' })
            .in('id', merge.source_ids)
            .eq('org_id', orgId)

          result.merged++
        }
      }

      result.kept += (decision.keep?.length ?? 0)
    } catch (err) {
      logger.warn('[consolidation] Failed to consolidate group:', err)
      result.kept += group.length
    }
  }

  return result
}
