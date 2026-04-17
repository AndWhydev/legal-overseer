/**
 * Memory Palace — Agent Tool Definitions
 *
 * Tools that the AI agent can invoke during conversations
 * to search, store, and manage institutional memories.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createMemoryPalace } from './service'
import { logger } from '@/lib/core/logger'
// MemoryType is a superset of MemoryCategory that includes service-level types
type MemoryType = 'conversation' | 'decision' | 'pattern' | 'fact' | 'relationship' | 'pricing' | 'convention' | 'lesson_learned'

// ─── Tool Definitions (for Anthropic tool_use) ─────────────────────────────

export const MEMORY_PALACE_TOOLS = [
  {
    name: 'search_memories',
    description: 'Search the institutional memory for past conversations, decisions, facts, pricing, patterns, and lessons learned. Use this when the user asks about past events, decisions, or when you need historical context.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query (e.g., "pricing for WordPress builds", "why did we stop working with TechCorp")',
        },
        memory_type: {
          type: 'string',
          enum: ['conversation', 'decision', 'pattern', 'fact', 'relationship', 'pricing', 'lesson_learned'],
          description: 'Optional: filter by memory type',
        },
        entity_id: {
          type: 'string',
          description: 'Optional: filter to memories about a specific entity (contact/project/etc UUID)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'recall_decisions',
    description: 'Get a timeline of business decisions, optionally filtered by domain (pricing, hiring, technical, client). Use this when the user asks about past decisions or their outcomes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        domain: {
          type: 'string',
          description: 'Optional: filter by decision domain (pricing, hiring, technical, client, etc.)',
        },
        entity_id: {
          type: 'string',
          description: 'Optional: filter to decisions about a specific entity',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 10)',
        },
      },
    },
  },
  {
    name: 'remember_this',
    description: 'Explicitly store a memory. Use when the user says "remember this", "note that", or when you identify important institutional knowledge worth preserving.',
    input_schema: {
      type: 'object' as const,
      properties: {
        memory_type: {
          type: 'string',
          enum: ['decision', 'fact', 'relationship', 'pricing', 'lesson_learned', 'pattern'],
          description: 'Type of memory to store',
        },
        title: {
          type: 'string',
          description: 'Short descriptive title (max 80 chars)',
        },
        content: {
          type: 'string',
          description: 'Full description of the memory with all relevant details',
        },
        entity_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'UUIDs of related entities (contacts, projects, etc.)',
        },
        entity_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Human-readable names of related entities',
        },
      },
      required: ['memory_type', 'title', 'content'],
    },
  },
  {
    name: 'forget_entity',
    description: 'GDPR forget: permanently delete all memories associated with a specific entity. This is irreversible. Use only when explicitly asked to forget everything about a person or company.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity_id: {
          type: 'string',
          description: 'UUID of the entity to forget',
        },
        confirmation: {
          type: 'string',
          description: 'Must be "CONFIRM_FORGET" to proceed',
        },
      },
      required: ['entity_id', 'confirmation'],
    },
  },
]

// ─── Tool Execution ─────────────────────────────────────────────────────────

export async function executeMemoryPalaceTool(
  supabase: SupabaseClient,
  orgId: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  const palace = createMemoryPalace(supabase, orgId)

  try {
    switch (toolName) {
      case 'search_memories': {
         
        const results = await palace.searchMemories({
          query: (input.query as string) ?? '',
          memoryType: input.memory_type as any,
          entityId: input.entity_id as string | undefined,
          limit: 10,
        })

        if (results.length === 0) {
          return 'No memories found matching your query.'
        }

        return results
          .map((r, i) => {
            const date = new Date(r.occurredAt).toLocaleDateString('en-AU')
            const conf = Math.round(r.confidence * 100)
            const entities = r.entityNames.length > 0 ? ` (${r.entityNames.join(', ')})` : ''
            return `${i + 1}. [${r.memoryType}|${date}|${conf}% confidence]${entities}\n   ${r.title}\n   ${r.content.slice(0, 300)}`
          })
          .join('\n\n')
      }

      case 'recall_decisions': {
        const decisions = await palace.getDecisions({
          domain: input.domain as string | undefined,
          entityId: input.entity_id as string | undefined,
          limit: (input.limit as number) ?? 10,
        })

        if (decisions.length === 0) {
          return 'No decisions found.'
        }

        return decisions
          .map((d, i) => {
            const date = new Date(d.decided_at).toLocaleDateString('en-AU')
            const outcome = d.outcome_status !== 'pending' ? ` → ${d.outcome_status}` : ''
            const lesson = d.lesson_learned ? `\n   Lesson: ${d.lesson_learned}` : ''
            return `${i + 1}. [${date}${outcome}] ${d.decision_summary}\n   Reasoning: ${d.reasoning_chain.slice(0, 200)}${lesson}`
          })
          .join('\n\n')
      }

      case 'remember_this': {
         
        const id = await palace.createMemory({
          memoryType: (input.memory_type ?? 'fact') as any,
          title: (input.title as string) ?? 'Untitled',
          content: (input.content as string) ?? '',
          sourceType: 'user_explicit',
          confidence: 0.95,
          decayRate: 'never',
          entityIds: (input.entity_ids as string[]) ?? [],
          entityNames: (input.entity_names as string[]) ?? [],
        })

        return id
          ? `Memory stored successfully (ID: ${id.slice(0, 8)}). I'll remember this.`
          : 'Failed to store memory.'
      }

      case 'forget_entity': {
        if (input.confirmation !== 'CONFIRM_FORGET') {
          return 'Forget operation requires confirmation="CONFIRM_FORGET" to proceed. This is irreversible.'
        }

        const result = await palace.forgetEntity(input.entity_id as string)
        return `Entity forgotten. Deleted ${result.memories_deleted} memories, ${result.decisions_deleted} decisions, ${result.patterns_deleted} patterns.`
      }

      default:
        return `Unknown tool: ${toolName}`
    }
  } catch (err) {
    logger.error('[memory-palace-tools] Execution failed', {
      tool: toolName,
      error: err instanceof Error ? err.message : String(err),
    })
    return `Error executing ${toolName}: ${err instanceof Error ? err.message : 'Unknown error'}`
  }
}
