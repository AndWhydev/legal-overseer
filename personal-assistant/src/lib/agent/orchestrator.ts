import { runAgentChat, type ChatMessage, type EngineConfig, type AgentEvent } from './engine'
import { selectModel } from './model-router'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AgentTask {
  id: string
  description: string
  model?: string
  dependsOn?: string[]
}

export interface OrchestratorConfig {
  orgId: string
  supabase: SupabaseClient
  tasks: AgentTask[]
}

export interface OrchestratorResult {
  taskId: string
  success: boolean
  output: string
  tokensUsed: number
}

export interface AgentResponse {
  message: string
  model: string
  purpose: string
  tokensUsed: number
  toolCalls: { name: string; success: boolean }[]
}

/**
 * Simple single-turn orchestration: classify input, select model, execute.
 * This is the foundation for future multi-agent teams.
 */
export async function orchestrate(
  input: string,
  history: ChatMessage[],
  orgId: string,
  supabase: SupabaseClient
): Promise<AgentResponse> {
  const selection = selectModel(input)

  const toolCalls: { name: string; success: boolean }[] = []
  let message = ''
  let tokensUsed = 0

  const config: EngineConfig = {
    orgId,
    supabase,
    model: selection.model,
  }

  for await (const event of runAgentChat(input, config)) {
    switch (event.type) {
      case 'message':
        message += event.data
        break
      case 'tool_result': {
        const data = event.data as { name: string; success: boolean }
        toolCalls.push({ name: data.name, success: data.success })
        break
      }
      case 'done': {
        const data = event.data as { tokens?: { input_tokens: number; output_tokens: number } }
        tokensUsed = (data.tokens?.input_tokens ?? 0) + (data.tokens?.output_tokens ?? 0)
        break
      }
      case 'error':
        message = `Error: ${event.data}`
        break
    }
  }

  return {
    message,
    model: selection.model,
    purpose: selection.purpose,
    tokensUsed,
    toolCalls,
  }
}

/**
 * Multi-task orchestration with dependency resolution.
 * Tasks execute in dependency order; blocked tasks fail gracefully.
 */
export async function orchestrateTasks(config: OrchestratorConfig): Promise<OrchestratorResult[]> {
  const results: OrchestratorResult[] = []
  const completed = new Set<string>()

  const pending = [...config.tasks]

  while (pending.length > 0) {
    const ready = pending.filter(t =>
      !t.dependsOn || t.dependsOn.every(dep => completed.has(dep))
    )

    if (ready.length === 0 && pending.length > 0) {
      for (const task of pending) {
        results.push({
          taskId: task.id,
          success: false,
          output: 'Blocked by unresolvable dependencies',
          tokensUsed: 0,
        })
      }
      break
    }

    for (const task of ready) {
      const engineConfig: EngineConfig = {
        orgId: config.orgId,
        supabase: config.supabase,
        model: task.model,
      }

      let output = ''
      let tokensUsed = 0
      let success = true

      try {
        for await (const event of runAgentChat(task.description, engineConfig)) {
          if (event.type === 'message') {
            output += event.data
          } else if (event.type === 'done') {
            const data = event.data as { tokens?: { input_tokens: number; output_tokens: number } }
            tokensUsed = (data.tokens?.input_tokens ?? 0) + (data.tokens?.output_tokens ?? 0)
          } else if (event.type === 'error') {
            success = false
            output = event.data
          }
        }
      } catch (err) {
        success = false
        output = String(err)
      }

      results.push({ taskId: task.id, success, output, tokensUsed })
      completed.add(task.id)

      const idx = pending.findIndex(t => t.id === task.id)
      if (idx !== -1) pending.splice(idx, 1)
    }
  }

  return results
}
