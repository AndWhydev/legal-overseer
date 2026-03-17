import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAgentTools, executeAgentTool, getJITInstruction, type ExecuteToolOptions, type ToolGroup } from './tools'
import { buildEntityAwarePrompt } from './prompt-builder'
import { ContextAssembler } from '@/lib/context-assembly/context-assembler'
import { selectModel } from './model-router'
import { resolveModel, resolveTokenLimit } from './model-registry'
import type { ModelPurpose } from './model-registry'
import { logAgentRun, estimateRunCost } from './run-logger'
import { canProceed } from './cost-guard'
import { generatePlan, stageFromToolName, isTrivialMessage, type PlanStage, type PlanOutput } from './planner'
import { withCircuitBreaker, CircuitOpenError } from './circuit-breaker'
import { writeToDeadLetterQueue } from './dlq'
import { reflectAction } from '@/lib/context/action-reflector'
import { detectLeak, scrubLeaks } from './response-guard'
import { logger } from '@/lib/core/logger'
import { extractCitationsFromToolResult, extractCitationsFromText, detectTopicShift, type Citation } from './citation-extractor'

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
  /** Pre-loaded conversation history to prepend to the messages array. */
  history?: Anthropic.MessageParam[]
  /** User ID for thread ownership and context assembly. */
  userId?: string
  /** Thread ID for conversation history loading via ContextAssembler. */
  threadId?: string
}

export type StageId = 'cost_check' | 'model_routing' | 'context_assembly' | 'api_streaming' | 'tool_execution'

export type AgentEvent =
  | { type: 'thinking'; data: string }
  | { type: 'thinking_start'; data: Record<string, never> }
  | { type: 'thinking_delta'; data: string }
  | { type: 'thinking_complete'; data: { duration_ms: number } }
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
  | { type: 'citation'; data: { citations: Array<{ index: number; url: string; title: string; description?: string }> } }
  | { type: 'checkpoint'; data: { message_index: number; label: string } }
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
  const userMessages: string[] = []
  let lastCheckpointAtMessageCount = 0

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

  // Agent kill switch: check if org has agents enabled
  const { data: orgRow } = await config.supabase
    .from('organizations')
    .select('agents_enabled')
    .eq('id', config.orgId)
    .single()

  if (orgRow && orgRow.agents_enabled === false) {
    yield { type: 'error', data: 'Agent execution is disabled for this organization. Contact your admin to re-enable.' }
    yield { type: 'done', data: {} }
    return
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const maxIterations = config.maxIterations || 8

  // Model routing: select model based on message complexity
  yield { type: 'stage', data: { stage: 'model_routing', status: 'start' } }
  const autoRouted = !config.model
  const selection = autoRouted ? selectModel(message) : null
  const model = config.model || selection?.model || resolveModel('conversation')
  const purpose: ModelPurpose = selection?.purpose || 'conversation'
  const maxTokens = selection ? resolveTokenLimit(selection.purpose) : resolveTokenLimit('conversation')
  yield { type: 'stage', data: { stage: 'model_routing', status: 'done' } }

  // Emit thinking_start so frontend knows engine is active
  yield { type: 'thinking_start', data: {} }

  // Context assembly: build entity-aware system prompt (with full history when threadId is available)
  yield { type: 'stage', data: { stage: 'context_assembly', status: 'start' } }
  let systemPrompt: string
  if (config.threadId && config.userId) {
    // ContextAssembler provides rich context: key facts, compressed history,
    // pending actions, and proper message ordering with the current message.
    try {
      const assembler = new ContextAssembler()
      const ctx = await assembler.assemble(config.supabase, config.userId, config.orgId, config.threadId, message)
      systemPrompt = ctx.systemPrompt
      config.history = ctx.messageHistory
      yield { type: 'stage', data: { stage: 'context_assembly', status: 'done', meta: { promptLength: systemPrompt.length, assemblyMs: ctx.metadata.assemblyMs, tiersLoaded: ctx.metadata.tiersLoaded.length, assembler: true } } }
    } catch (assemblerErr) {
      // ContextAssembler failed (e.g., Total Recall tables missing) — fall
      // back to basic prompt. Pipeline-loaded history (config.history) is
      // still available from the pipeline's own loadRecentMessages call.
      logger.warn('[engine] ContextAssembler failed, falling back to basic prompt', {
        error: assemblerErr instanceof Error ? assemblerErr.message : String(assemblerErr),
        threadId: config.threadId,
      })
      systemPrompt = await buildEntityAwarePrompt(config.supabase, config.orgId, message)
      yield { type: 'stage', data: { stage: 'context_assembly', status: 'done', meta: { promptLength: systemPrompt.length, assemblerFallback: true } } }
    }
  } else {
    systemPrompt = await buildEntityAwarePrompt(config.supabase, config.orgId, message)
    yield { type: 'stage', data: { stage: 'context_assembly', status: 'done', meta: { promptLength: systemPrompt.length } } }
  }

  if (autoRouted && selection) {
    logger.info(`[model-router] ${selection.purpose}: ${selection.reasoning}`)
  }

  let tools = getAgentTools()
  let toolNames = tools.map(t => t.name)
  const totalToolCount = tools.length

  // Two-pass planning: Haiku generates user-meaningful stages (non-blocking)
  const entityCtxMatch = systemPrompt.match(/## Entity Context\n\n([\s\S]*?)(?:\n## |$)/)
  const entityContext = entityCtxMatch?.[1]?.trim() || ''

  let planStages: PlanStage[] = []
  const activatedStages = new Set<string>()
  let toolGroupsApplied = false

  // Fire Haiku planner in parallel for non-trivial messages
  let planPromise: Promise<PlanOutput> | null = null
  if (!isTrivialMessage(message)) {
    planPromise = generatePlan(message, entityContext, toolNames).catch(() => ({ stages: [], toolGroups: [] }) as PlanOutput)
  }

  // Give Haiku a brief race window (500ms) before starting Sonnet
  if (planPromise) {
    const raceResult = await Promise.race([
      planPromise.then(plan => ({ ready: true as const, plan })),
      new Promise<{ ready: false }>(resolve => setTimeout(() => resolve({ ready: false }), 500)),
    ])
    if (raceResult.ready && raceResult.plan.stages.length > 0) {
      planStages = raceResult.plan.stages
      yield { type: 'plan', data: { stages: planStages } }

      // Apply tool group filtering from planner output
      if (raceResult.plan.toolGroups.length > 0) {
        tools = getAgentTools(raceResult.plan.toolGroups)
        toolNames = tools.map(t => t.name)
        toolGroupsApplied = true
        logger.info('[engine] Tool groups selected', {
          toolGroups: raceResult.plan.toolGroups,
          toolCount: tools.length,
          totalAvailable: totalToolCount,
        })
      }

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

  // When ContextAssembler was used, history already includes the current message
  let messages: Anthropic.MessageParam[] = config.threadId
    ? [...(config.history || [])]
    : [...(config.history || []), { role: 'user', content: message }]

  // Track initial message count for checkpoints
  userMessages.push(message)

  for (let i = 0; i < maxIterations; i++) {
    iterationCount++
    let response: Anthropic.Message
    // Collect streamed deltas inside the circuit breaker so they can be yielded after
    const streamedDeltas: string[] = []
    const streamedThinkingDeltas: string[] = []
    let thinkingActive = false
    let thinkingStartTime: number | null = null
    try {
      yield { type: 'stage', data: { stage: 'api_streaming', status: 'start', meta: { iteration: iterationCount } } }

      const agentType = config.agentType || 'default'

      response = await withCircuitBreaker(
        `anthropic:${agentType}`,
        async () => {
          const streamConfig: any = {
            model,
            max_tokens: maxTokens,
            system: fullSystemPrompt,
            tools,
            messages,
          }

          // Add thinking config for synthesis tier requests
          if (purpose === 'synthesis') {
            streamConfig.thinking = {
              type: 'enabled',
              budget_tokens: 8192,
            }
          }

          const stream = client.messages.stream(streamConfig)

          // Collect text and thinking deltas for streaming after circuit breaker resolves
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              streamedDeltas.push(event.delta.text)
            } else if (event.type === 'content_block_delta' && (event.delta as any).type === 'thinking_delta') {
              // Collect thinking deltas for streaming
              const thinkingDelta = (event.delta as any)['thinking']
              if (thinkingDelta) {
                streamedThinkingDeltas.push(thinkingDelta)
              }
            } else if (event.type === 'content_block_start' && (event.content_block as any).type === 'thinking') {
              // Track thinking start
              thinkingActive = true
              thinkingStartTime = Date.now()
            } else if (event.type === 'content_block_stop' && thinkingActive) {
              // Thinking block ended
              thinkingActive = false
            }
          }

          return stream.finalMessage()
        },
        { threshold: 5, cooldownMs: 60_000 }
      )

      // Yield thinking deltas if any
      for (const delta of streamedThinkingDeltas) {
        yield { type: 'thinking_delta', data: delta }
      }

      // Emit thinking_complete if thinking was active
      if (thinkingStartTime !== null && streamedThinkingDeltas.length > 0) {
        const duration = Date.now() - thinkingStartTime
        yield { type: 'thinking_complete', data: { duration_ms: duration } }
      }

      // Yield collected text deltas to the client (scrub any model/provider leaks)
      for (const delta of streamedDeltas) {
        const scrubbed = scrubLeaks(delta)
        const leak = detectLeak(delta)
        if (leak.leaked) {
          logger.warn('response_leak_detected', { patterns: leak.patterns })
        }
        yield { type: 'content_delta', data: scrubbed }
      }

      yield { type: 'stage', data: { stage: 'api_streaming', status: 'done', meta: { tokens: response.usage } } }

      // Check if late Haiku plan arrived during Sonnet streaming
      if (planPromise) {
        try {
          const latePlan = await planPromise
          if (latePlan.stages.length > 0 && planStages.length === 0) {
            planStages = latePlan.stages
            yield { type: 'plan', data: { stages: planStages } }

            // Do NOT re-filter tools mid-conversation — KV cache is already primed
            // with the full tool list. Log the late plan for observability only.
            if (latePlan.toolGroups.length > 0 && !toolGroupsApplied) {
              logger.info('[engine] Late plan arrived with tool groups (not applied — KV cache preservation)', {
                toolGroups: latePlan.toolGroups,
                reason: 'tools already locked for this turn',
              })
            }
          }
        } catch {}
        planPromise = null
      }
    } catch (err) {
      // Circuit breaker OPEN -- temporary condition, do not write to DLQ
      if (err instanceof CircuitOpenError) {
        logger.warn(`[engine] Circuit breaker open for ${err.circuitKey}, skipping LLM call`)
        yield { type: 'error', data: `Service temporarily unavailable (circuit open for ${err.circuitKey}). Please retry shortly.` }

        if (config.agentConfigId) {
          await logAgentRun(config.supabase, {
            org_id: config.orgId,
            agent_config_id: config.agentConfigId,
            trigger_type: 'chat',
            trigger_payload: { message },
            status: 'error',
            tokens_in: totalInputTokens,
            tokens_out: totalOutputTokens,
            cost_estimate: estimateRunCost(totalInputTokens, totalOutputTokens, purpose),
            duration_ms: Date.now() - startTime,
            tool_calls: toolCallCount,
            iterations: iterationCount,
            error_message: `Circuit breaker open: ${err.circuitKey}`,
          })
        }
        yield { type: 'done', data: {} }
        return
      }

      const errorMsg = err instanceof Error ? err.message : String(err)
      const errorStack = err instanceof Error ? err.stack : undefined
      yield { type: 'error', data: `API error: ${errorMsg}` }
      outcome = 'error'

      // Write to dead letter queue for post-mortem analysis
      await writeToDeadLetterQueue(config.supabase, {
        orgId: config.orgId,
        agentType: config.agentType || 'unknown',
        agentConfigId: config.agentConfigId,
        errorMessage: errorMsg,
        errorStack,
        payload: { message, model, iteration: iterationCount },
      })

      if (config.agentConfigId) {
        await logAgentRun(config.supabase, {
          org_id: config.orgId,
          agent_config_id: config.agentConfigId,
          trigger_type: 'chat',
          trigger_payload: { message },
          status: 'error',
          tokens_in: totalInputTokens,
          tokens_out: totalOutputTokens,
          cost_estimate: estimateRunCost(totalInputTokens, totalOutputTokens, purpose),
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
      const scrubbedText = scrubLeaks(text)
      const leak = detectLeak(text)
      if (leak.leaked) {
        logger.warn('response_leak_detected', { patterns: leak.patterns })
      }
      finalMessage = scrubbedText
      yield { type: 'message', data: scrubbedText }

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
          cost_estimate: estimateRunCost(totalInputTokens, totalOutputTokens, purpose),
          duration_ms: Date.now() - startTime,
          tool_calls: toolCallCount,
          iterations: iterationCount,
        })
      }

      logger.info('ai_response_complete', { model, purpose, tokens: response.usage })
      yield { type: 'done', data: { tokens: response.usage } }
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

        // Extract citations from tool result
        try {
          const citations = extractCitationsFromToolResult(tool.name, result.data)
          if (citations && citations.length > 0) {
            yield {
              type: 'citation',
              data: { citations },
            }
          }

          // Also check for RAG citations from search_memory
          if ((!citations || citations.length === 0) && tool.name === 'search_memory') {
            try {
              const { extractRAGCitations } = await import('./citation-extractor')
              const ragCitations = extractRAGCitations(tool.name, result.data)
              if (ragCitations.length > 0) {
                yield {
                  type: 'citation',
                  data: { citations: ragCitations },
                }
              }
            } catch {
              // Non-critical RAG citation extraction failure
              logger.debug('[engine] RAG citation extraction failed', { tool: tool.name })
            }
          }
        } catch {
          // Citation extraction failure should not block tool result processing
          logger.debug('[engine] Citation extraction failed for tool', { tool: tool.name })
        }

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

        // Fire-and-forget context write-back
        if (result.success && !result.queued) {
          reflectAction(config.supabase, config.orgId, tool.name, tool.input as Record<string, unknown>, result.data)
            .catch(err => logger.error('[engine] action reflect failed', { err, tool: tool.name }))
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

        // Truncate tool results to prevent token overflow (200K API limit).
        // Large results from fetch_url/browse_website can blow the context window.
        const MAX_TOOL_RESULT_CHARS = 12000
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: result.queued
            ? `Action queued for approval (ID: ${result.approvalId}). Confidence: ${((result.data as any)?.confidence * 100 || 0).toFixed(0)}%`
            : result.success
              ? (() => {
                  let data = JSON.stringify(result.data)
                  if (data.length > MAX_TOOL_RESULT_CHARS) {
                    data = data.slice(0, MAX_TOOL_RESULT_CHARS) + '\n\n[Content truncated — ' + (data.length - MAX_TOOL_RESULT_CHARS).toLocaleString() + ' chars omitted]'
                  }
                  const jit = getJITInstruction(tool.name)
                  return jit ? `${data}\n\n---\n${jit}` : data
                })()
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

    // Emit checkpoint events every 10 turns or when topic shifts
    const messageCount = messages.length
    if (messageCount - lastCheckpointAtMessageCount >= 20) {
      yield {
        type: 'checkpoint',
        data: {
          message_index: messageCount,
          label: `Checkpoint at turn ${iterationCount}`,
        },
      }
      lastCheckpointAtMessageCount = messageCount
    }

    // Detect topic shift from last 2 user messages
    if (userMessages.length >= 2) {
      try {
        const lastTwoMessages = userMessages.slice(-2)
        const topicShifted = detectTopicShift(lastTwoMessages)
        if (topicShifted) {
          yield {
            type: 'checkpoint',
            data: {
              message_index: messageCount,
              label: 'Topic shift detected',
            },
          }
          lastCheckpointAtMessageCount = messageCount
        }
      } catch {
        // Topic shift detection failure should not block execution
        logger.debug('[engine] Topic shift detection failed')
      }
    }

    // Track new user messages for checkpoint detection
    if (toolResults.length > 0) {
      // After tool execution, model will respond with new content
      // Track user's acknowledgment in next iteration if they provide feedback
    }
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
      cost_estimate: estimateRunCost(totalInputTokens, totalOutputTokens, purpose),
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
