import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolResult } from '../tools'
import { logger } from '@/lib/core/logger'

export const spawnAgentToolDefinition: Anthropic.Tool = {
  name: 'spawn_agent',
  description: `Spawn an isolated sub-agent to handle a complex sub-task with its own context window. Use when the current request has multiple independent parts that benefit from focused execution. Each sub-agent runs a full tool loop and returns a summary.

When to use:
- The request has 3+ distinct action chains (e.g., "sort out everything with Steve")
- A sub-task requires deep research that would consume too much context
- Parallel execution would speed things up

When NOT to use:
- Simple single-tool operations (just call the tool directly)
- Tasks requiring sequential context from this conversation
- Trivial lookups or quick answers

Sub-agents start fresh (system prompt + task). They do NOT see this conversation's history. Write the task with enough context for independent work.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      task: {
        type: 'string',
        description: 'Detailed task description with all needed context. Include entity names, IDs, and specific instructions. The sub-agent cannot see this conversation.',
      },
      description: {
        type: 'string',
        description: 'Short 3-5 word label for UI display (e.g., "Fix Steve photos")',
      },
      tool_groups: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: restrict to specific tool groups (core, memory, channel, web, comms, agentic). Defaults to all.',
      },
    },
    required: ['task', 'description'] as string[],
  },
}

export interface SpawnContext {
  currentDepth: number
  maxDepth: number
  parentAgentId?: string
  engineConfig?: Record<string, unknown>
}

export async function handleSpawnAgent(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
  spawnContext: SpawnContext,
): Promise<ToolResult> {
  const task = input.task as string
  const description = input.description as string
  const sideEvents: Array<{ type: string; data: unknown }> = []

  // Depth guard: prevent infinite recursion
  if (spawnContext.currentDepth >= spawnContext.maxDepth) {
    return {
      success: false,
      error: `Sub-agent depth limit reached (${spawnContext.maxDepth}). Handle this task directly instead of spawning another sub-agent.`,
    }
  }

  const agentId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Emit start event
  sideEvents.push({ type: 'sub_agent_start', data: { agentId, description } })

  logger.info('[spawn-agent] Spawning sub-agent', {
    agentId,
    description,
    depth: spawnContext.currentDepth + 1,
    parentId: spawnContext.parentAgentId,
  })

  try {
    // Dynamic import to avoid circular dependency (taor-loop imports tools, tools imports taor-loop)
    const { runTAORLoop } = await import('../engine/taor-loop')

    let finalMessage = ''

    for await (const event of runTAORLoop(task, {
      orgId,
      supabase,
      agentConfigId: spawnContext.engineConfig?.agentConfigId as string | undefined,
      skipCostGuard: false,
      parentAgentId: agentId,
      maxDepth: spawnContext.maxDepth,
      // Pass depth to the sub-agent so it knows its nesting level
      _spawnDepth: spawnContext.currentDepth + 1,
    } as any)) {
      // Only capture the final message — sub-agent events are NOT forwarded to parent SSE
      if (event.type === 'message') {
        finalMessage = event.data as string
      }
    }

    if (!finalMessage) {
      sideEvents.push({ type: 'sub_agent_complete', data: { agentId, summary: '(no response)' } })
      return { success: false, error: 'Sub-agent completed without producing a response.', sideEvents }
    }

    logger.info('[spawn-agent] Sub-agent complete', {
      agentId,
      description,
      messageLength: finalMessage.length,
    })

    // Emit complete event with summary
    const summaryPreview = finalMessage.length > 200 ? finalMessage.slice(0, 197) + '...' : finalMessage
    sideEvents.push({ type: 'sub_agent_complete', data: { agentId, summary: summaryPreview } })

    return { success: true, data: finalMessage, sideEvents }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[spawn-agent] Sub-agent failed', { agentId, error: errorMsg })
    sideEvents.push({ type: 'sub_agent_complete', data: { agentId, summary: `Failed: ${errorMsg}` } })
    return { success: false, error: `Sub-agent "${description}" failed: ${errorMsg}`, sideEvents }
  }
}
