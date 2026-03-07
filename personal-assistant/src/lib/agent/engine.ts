import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAgentTools, executeAgentTool, type ExecuteToolOptions } from './tools'
import { buildEntityAwarePrompt } from './prompt-builder'
import { selectModel, getModel } from './model-router'
import { logAgentRun, estimateRunCost } from './run-logger'
import { canProceed } from './cost-guard'
import { generatePlan, stageFromToolName, isTrivialMessage, type PlanStage } from './planner'
import type { ModelTier } from '@/lib/bitbit-core'
import { logger } from '@/lib/core/logger'

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
  /** Agent type for confidence routing defaults (e.g. 'lead-swarm', 'invoice-flow'). */
  agentType?: string
  /** Organization settings for confidence thresholds. */
  orgSettings?: { confidence_thresholds?: { act?: number; ask?: number } }
}

export type StageId = 'cost_check' | 'model_routing' | 'context_assembly' | 'api_streaming' | 'tool_execution'

export type AgentEvent =
  | { type: 'thinking'; data: string }
  | { type: 'thinking_start'; data: Record<string, never> }
  | { type: 'stage'; data: { stage: StageId; status: 'start' | 'done'; meta?: Record<string, unknown> } }
  | { type: 'plan'; data: { stages: PlanStage[] } }
  | { type: 'plan_stage_update'; data: { stageId: string; status: 'active' | 'done' | 'error' } }
  | { type: 'tool_call'; data: { name: string; input: unknown } }
  | {
      type: 'tool_result'
      data: {
        name: string
        result: unknown
        success: boolean
        queued?: boolean
        approvalId?: string
      }
    }
  | { type: 'content_delta'; data: string }
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
    yield { type: 'stage', data: { stage: 'cost_check', status: 'start' } }
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
      logger.warn('[engine] Cost guard check failed, proceeding anyway')
    }
    yield { type: 'stage', data: { stage: 'cost_check', status: 'done', meta: { allowed: true } } }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const maxIterations = config.maxIterations || 8

  // Model routing: select model based on message complexity
  yield { type: 'stage', data: { stage: 'model_routing', status: 'start' } }
  const autoRouted = !config.model
  const selection = autoRouted ? selectModel(message) : null
  const model = config.model || selection?.model || 'claude-sonnet-4-5-20250929'
  const maxTokens = selection ? getModel(selection.tier).maxTokens : 4096
  const tier: ModelTier = (selection?.tier as ModelTier) || 'sonnet'
  yield { type: 'stage', data: { stage: 'model_routing', status: 'done', meta: { tier, model: autoRouted ? selection?.tier : 'manual' } } }

  // Emit thinking_start so frontend knows engine is active
  yield { type: 'thinking_start', data: {} }

  // Context assembly: build entity-aware system prompt
  yield { type: 'stage', data: { stage: 'context_assembly', status: 'start' } }
  const systemPrompt = await buildEntityAwarePrompt(config.supabase, config.orgId, message)
  yield { type: 'stage', data: { stage: 'context_assembly', status: 'done', meta: { promptLength: systemPrompt.length } } }

  if (autoRouted && selection) {
    logger.info(`[model-router] ${selection.tier}: ${selection.reasoning}`)
  }

  const tools = getAgentTools()
  const toolNames = tools.map(t => t.name)

  // Two-pass planning: Haiku generates user-meaningful stages (non-blocking)
  const entityCtxMatch = systemPrompt.match(/## Entity Context\n\n([\s\S]*?)(?:\n## |$)/)
  const entityContext = entityCtxMatch?.[1]?.trim() || ''

  let planStages: PlanStage[] = []
  const activatedStages = new Set<string>()

  // Fire Haiku planner in parallel for non-trivial messages
  let planPromise: Promise<PlanStage[]> | null = null
  if (!isTrivialMessage(message)) {
    planPromise = generatePlan(message, entityContext, toolNames).catch(() => [] as PlanStage[])
  }

  // Give Haiku a brief race window (500ms) before starting Sonnet
  if (planPromise) {
    const raceResult = await Promise.race([
      planPromise.then(stages => ({ ready: true as const, stages })),
      new Promise<{ ready: false }>(resolve => setTimeout(() => resolve({ ready: false }), 500)),
    ])
    if (raceResult.ready && raceResult.stages.length > 0) {
      planStages = raceResult.stages
      yield { type: 'plan', data: { stages: planStages } }
      planPromise = null
    }
  }

  // Build plan-aware system prompt addition
  let fullSystemPrompt = systemPrompt
  if (planStages.length > 0) {
    const planDescription = planStages
      .map((s, i) => `${i + 1}. ${s.icon} ${s.label}${s.sublabel ? ` (${s.sublabel})` : ''}${s.toolHint ? ` [tool: ${s.toolHint}]` : ''}`)
      .join('\n')
    fullSystemPrompt += `\n\n## Execution Plan\nFollow this plan to fulfill the user's request:\n${planDescription}\n`
  }

  let messages: Anthropic.MessageParam[] = [{ role: 'user', content: message }]

  for (let i = 0; i < maxIterations; i++) {
    iterationCount++
    let response: Anthropic.Message
    try {
      yield { type: 'stage', data: { stage: 'api_streaming', status: 'start', meta: { model, iteration: iterationCount } } }
      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system: fullSystemPrompt,
        tools,
        messages,
      })

      // Stream text deltas to the client in real-time
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'content_delta', data: event.delta.text }
        }
      }

      response = await stream.finalMessage()
      yield { type: 'stage', data: { stage: 'api_streaming', status: 'done', meta: { tokens: response.usage } } }

      // Check if late Haiku plan arrived during Sonnet streaming
      if (planPromise) {
        try {
          const lateStages = await planPromise
          if (lateStages.length > 0 && planStages.length === 0) {
            planStages = lateStages
            yield { type: 'plan', data: { stages: planStages } }
          }
        } catch {}
        planPromise = null
      }
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

      // Mark remaining plan stages as done
      for (const stage of planStages) {
        if (!activatedStages.has(stage.id)) {
          yield { type: 'plan_stage_update', data: { stageId: stage.id, status: 'done' } }
          activatedStages.add(stage.id)
        }
      }

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

      // Match tool to plan stage and emit plan_stage_update
      const matchedStage = planStages.find(s => s.toolHint === tool.name && !activatedStages.has(s.id))
      if (matchedStage) {
        yield { type: 'plan_stage_update', data: { stageId: matchedStage.id, status: 'active' } }
        activatedStages.add(matchedStage.id)
      } else if (planStages.length === 0) {
        // Reactive fallback: dynamically add stage from tool name
        const reactiveStage = stageFromToolName(tool.name)
        if (reactiveStage) {
          planStages.push(reactiveStage)
          yield { type: 'plan', data: { stages: planStages } }
          yield { type: 'plan_stage_update', data: { stageId: reactiveStage.id, status: 'active' } }
          activatedStages.add(reactiveStage.id)
        }
      }

      yield { type: 'stage', data: { stage: 'tool_execution', status: 'start', meta: { toolName: tool.name, iteration: iterationCount } } }
      yield { type: 'tool_call', data: { name: tool.name, input: tool.input } }
      try {
        // Build execution options for confidence routing
        let execOptions: ExecuteToolOptions | undefined
        if (config.agentConfigId) {
          execOptions = {
            agentConfigId: config.agentConfigId,
            orgSettings: config.orgSettings,
            agentType: config.agentType,
            // Confidence score would be provided by tool caller (e.g., LLM classification)
            // For now, tools execute unconditionally unless explicitly provided
            confidenceScore: undefined,
          }
        }

        const result = await executeAgentTool(
          tool.name,
          tool.input as Record<string, unknown>,
          config.orgId,
          config.supabase,
          execOptions
        )
        yield {
          type: 'tool_result',
          data: {
            name: tool.name,
            result: result.data,
            success: result.success,
            queued: result.queued,
            approvalId: result.approvalId,
          },
        }
        yield {
          type: 'stage',
          data: {
            stage: 'tool_execution',
            status: 'done',
            meta: {
              toolName: tool.name,
              success: result.success,
              queued: result.queued,
              approvalId: result.approvalId,
            },
          },
        }

        // Mark matched plan stage as done
        if (matchedStage) {
          yield { type: 'plan_stage_update', data: { stageId: matchedStage.id, status: 'done' } }
        } else if (planStages.length > 0) {
          // Try to find and complete a reactive stage
          const reactiveMatch = planStages.find(s => s.id === tool.name)
          if (reactiveMatch) {
            yield { type: 'plan_stage_update', data: { stageId: reactiveMatch.id, status: result.success ? 'done' : 'error' } }
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: result.queued
            ? `Action queued for approval (ID: ${result.approvalId}). Confidence: ${((result.data as any)?.confidence * 100 || 0).toFixed(0)}%`
            : result.success
              ? JSON.stringify(result.data)
              : `Error: ${result.error}`,
          is_error: !result.success && !result.queued,
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        yield {
          type: 'tool_result',
          data: { name: tool.name, result: null, success: false },
        }
        yield { type: 'stage', data: { stage: 'tool_execution', status: 'done', meta: { toolName: tool.name, success: false } } }

        // Mark matched plan stage as error
        if (matchedStage) {
          yield { type: 'plan_stage_update', data: { stageId: matchedStage.id, status: 'error' } }
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
