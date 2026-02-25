import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAgentTools, executeAgentTool } from './tools'
import { buildEntityAwarePrompt } from './prompt-builder'
import { selectModel, getModel } from './model-router'
import { logAgentRun, estimateRunCost } from './run-logger'
import { canProceed } from './cost-guard'
import type { ModelTier } from '@/lib/bitbit-core'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallResult[]
}

export interface ToolCallResult {
  name: string
  input: Record<string, unknown>
  result: unknown
  success: boolean
}

export interface EngineConfig {
  orgId: string
  supabase: SupabaseClient
  model?: string
  maxIterations?: number
  /** Agent config ID for run logging. If omitted, run logging is skipped. */
  agentConfigId?: string
  /** Skip cost guard check (e.g. for interactive chat vs background agents). */
  skipCostGuard?: boolean
}

export type AgentEvent =
  | { type: 'thinking'; data: string }
  | { type: 'tool_call'; data: { name: string; input: unknown } }
  | { type: 'tool_result'; data: { name: string; result: unknown; success: boolean } }
  | { type: 'message'; data: string }
  | { type: 'error'; data: string }
  | { type: 'cost_blocked'; data: { spentToday: number; dailyLimit: number } }
  | { type: 'done'; data: unknown }

export async function* runAgentChat(
  message: string,
  config: EngineConfig
): AsyncGenerator<AgentEvent> {
  const startTime = Date.now()
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let iterationCount = 0
  let toolCallCount = 0
  let outcome: 'success' | 'error' | 'max_iterations' | 'cost_blocked' = 'success'
  let finalMessage = ''

  // Cost guard: check daily budget before running (background agents)
  if (!config.skipCostGuard) {
    try {
      const budget = await canProceed(config.supabase, config.orgId)
      if (!budget.allowed) {
        yield {
          type: 'cost_blocked',
          data: { spentToday: budget.spentToday, dailyLimit: budget.dailyLimit },
        }
        yield { type: 'error', data: budget.reason || 'Daily cost limit reached' }
        outcome = 'cost_blocked'
        // Still log the blocked run
        if (config.agentConfigId) {
          await logAgentRun(config.supabase, {
            org_id: config.orgId,
            agent_config_id: config.agentConfigId,
            trigger_type: 'chat',
            trigger_payload: { message },
            status: 'cost_blocked',
            tokens_in: 0,
            tokens_out: 0,
            cost_estimate: 0,
            duration_ms: Date.now() - startTime,
            tool_calls: 0,
            iterations: 0,
            error_message: budget.reason || 'Daily cost limit reached',
          })
        }
        yield { type: 'done', data: {} }
        return
      }
    } catch {
      // Cost guard failure should not block execution
      console.warn('[engine] Cost guard check failed, proceeding anyway')
    }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const maxIterations = config.maxIterations || 8

  // Model routing: select model based on message complexity
  const autoRouted = !config.model
  const selection = autoRouted ? selectModel(message) : null
  const model = config.model || selection?.model || 'claude-sonnet-4-5-20250929'
  const maxTokens = selection ? getModel(selection.tier).maxTokens : 4096
  const tier: ModelTier = (selection?.tier as ModelTier) || 'sonnet'

  const systemPrompt = await buildEntityAwarePrompt(config.supabase, config.orgId, message)

  if (autoRouted && selection) {
    console.log(`[model-router] ${selection.tier}: ${selection.reasoning}`)
    yield { type: 'thinking', data: `Routing to ${selection.tier} (${selection.reasoning})` }
  }

  const tools = getAgentTools()
  let messages: Anthropic.MessageParam[] = [{ role: 'user', content: message }]

  for (let i = 0; i < maxIterations; i++) {
    iterationCount++
    let response: Anthropic.Message
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        tools,
        messages,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      yield { type: 'error', data: `API error: ${errorMsg}` }
      outcome = 'error'

      if (config.agentConfigId) {
        await logAgentRun(config.supabase, {
          org_id: config.orgId,
          agent_config_id: config.agentConfigId,
          trigger_type: 'chat',
          trigger_payload: { message },
          status: 'error',
          tokens_in: totalInputTokens,
          tokens_out: totalOutputTokens,
          cost_estimate: estimateRunCost(totalInputTokens, totalOutputTokens, tier),
          duration_ms: Date.now() - startTime,
          tool_calls: toolCallCount,
          iterations: iterationCount,
          error_message: errorMsg,
        })
      }
      yield { type: 'done', data: {} }
      return
    }

    // Track token usage
    totalInputTokens += response.usage?.input_tokens || 0
    totalOutputTokens += response.usage?.output_tokens || 0

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
      finalMessage = text
      yield { type: 'message', data: text }

      // Log successful run
      if (config.agentConfigId) {
        await logAgentRun(config.supabase, {
          org_id: config.orgId,
          agent_config_id: config.agentConfigId,
          trigger_type: 'chat',
          trigger_payload: { message },
          status: 'success',
          result_summary: text.slice(0, 500),
          tokens_in: totalInputTokens,
          tokens_out: totalOutputTokens,
          cost_estimate: estimateRunCost(totalInputTokens, totalOutputTokens, tier),
          duration_ms: Date.now() - startTime,
          tool_calls: toolCallCount,
          iterations: iterationCount,
        })
      }

      yield { type: 'done', data: { tokens: response.usage, model, tier: selection?.tier } }
      return
    }

    const toolBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    )

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tool of toolBlocks) {
      toolCallCount++
      yield { type: 'tool_call', data: { name: tool.name, input: tool.input } }
      try {
        const result = await executeAgentTool(
          tool.name,
          tool.input as Record<string, unknown>,
          config.orgId,
          config.supabase
        )
        yield {
          type: 'tool_result',
          data: { name: tool.name, result: result.data, success: result.success },
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: result.success ? JSON.stringify(result.data) : `Error: ${result.error}`,
          is_error: !result.success,
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        yield {
          type: 'tool_result',
          data: { name: tool.name, result: null, success: false },
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: `Tool execution failed: ${errorMsg}`,
          is_error: true,
        })
      }
    }

    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ]
  }

  outcome = 'max_iterations'

  // Log max-iterations run
  if (config.agentConfigId) {
    await logAgentRun(config.supabase, {
      org_id: config.orgId,
      agent_config_id: config.agentConfigId,
      trigger_type: 'chat',
      trigger_payload: { message },
      status: 'max_iterations',
      tokens_in: totalInputTokens,
      tokens_out: totalOutputTokens,
      cost_estimate: estimateRunCost(totalInputTokens, totalOutputTokens, tier),
      duration_ms: Date.now() - startTime,
      tool_calls: toolCallCount,
      iterations: iterationCount,
    })
  }

  yield {
    type: 'message',
    data: 'Reached maximum iterations. Please try again with a more specific request.',
  }
  yield { type: 'done', data: {} }
}
