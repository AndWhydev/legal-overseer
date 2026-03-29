/**
 * TAOR Loop — Think, Act, Observe, Repeat
 *
 * Clean replacement for the 1,100-line engine.ts. The model decides when to
 * stop (no iteration cap, no convergence hints, no observation masking).
 * Anthropic's compaction API handles context overflow if it fires.
 *
 * Safety ceiling: 50 iterations for runaway cost protection only — should
 * never be hit in practice.
 *
 * Pre-flight checks, tool execution, and types are imported from the
 * modules extracted in Task 1.
 */

import Anthropic from '@anthropic-ai/sdk'
import { getAgentTools, type ExecuteToolOptions, type ToolGroup } from '@/lib/agent/tools'
import { getEagerTools, buildDeferredToolsPrompt, resolveToolSchema } from '@/lib/agent/tools/deferred-loader'
import { selectRelevantTools } from '@/lib/agent/tool-rag'
import { buildEntityAwarePrompt } from '@/lib/agent/prompt-builder'
import { ContextAssembler } from '@/lib/context-assembly/context-assembler'
import { selectModel } from '@/lib/agent/model-router'
import { resolveModel, resolveTokenLimit } from '@/lib/agent/model-registry'
import type { ModelPurpose } from '@/lib/agent/model-registry'
import { logAgentRun, estimateRunCost } from '@/lib/agent/run-logger'
import { generatePlan, stageFromToolName, isTrivialMessage, type PlanStage, type PlanOutput } from '@/lib/agent/planner'
import { withCircuitBreaker, CircuitOpenError } from '@/lib/agent/circuit-breaker'
import { writeToDeadLetterQueue } from '@/lib/agent/dlq'
import { detectLeak, scrubLeaks } from '@/lib/agent/response-guard'
import { logger } from '@/lib/core/logger'
import { detectTopicShift } from '@/lib/agent/citation-extractor'

import type { EngineConfig, AgentEvent } from './types'
import { preFlightChecks } from './pre-flight'
import { executeToolBatch } from './tool-executor'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Safety ceiling — only for runaway cost protection. The model decides when to stop. */
const SAFETY_CEILING = 50

/** Server-side compaction: API summarizes conversation when context overflows. */
const COMPACTION_ENABLED = process.env.BITBIT_ENABLE_COMPACTION !== 'false' // default: enabled

// ---------------------------------------------------------------------------
// TAOR Loop
// ---------------------------------------------------------------------------

export async function* runTAORLoop(
  message: string,
  config: EngineConfig & { toolGroups?: string[]; _spawnDepth?: number },
): AsyncGenerator<AgentEvent> {
  const startTime = Date.now()
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let iterationCount = 0
  let toolCallCount = 0
  let finalMessage = ''
  const userMessages: string[] = []
  let lastCheckpointAtMessageCount = 0
  let executionTokens = 0
  let activeRole: string | undefined

  // ── 1. Pre-flight checks ───────────────────────────────────────────
  const preflight = await preFlightChecks(config, message)
  for (const event of preflight.events) {
    yield event
  }
  if (preflight.blocked) return
  if (preflight.calibratedThresholds) {
    config.calibratedThresholds = preflight.calibratedThresholds
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // ── 2. Model routing ───────────────────────────────────────────────
  yield { type: 'stage', data: { stage: 'model_routing', status: 'start' } }
  const autoRouted = !config.model
  const selection = autoRouted ? selectModel(message) : null
  const model = config.model || selection?.model || resolveModel('conversation')
  const purpose: ModelPurpose = selection?.purpose || 'conversation'
  const maxTokens = selection ? resolveTokenLimit(selection.purpose) : resolveTokenLimit('conversation')
  yield { type: 'stage', data: { stage: 'model_routing', status: 'done' } }

  yield { type: 'thinking_start', data: {} }

  // ── 3. Context assembly ────────────────────────────────────────────
  yield { type: 'stage', data: { stage: 'context_assembly', status: 'start' } }

  const userProfile = (config.userEmail || config.userDisplayName)
    ? { email: config.userEmail, displayName: config.userDisplayName }
    : undefined

  let systemPrompt: string
  if (config.threadId && config.userId) {
    try {
      const assembler = new ContextAssembler({ userProfile })
      const ctx = await assembler.assemble(config.supabase, config.userId, config.orgId, config.threadId, message)
      systemPrompt = ctx.systemPrompt
      config.history = ctx.messageHistory
      yield {
        type: 'stage',
        data: {
          stage: 'context_assembly',
          status: 'done',
          meta: {
            promptLength: systemPrompt.length,
            assemblyMs: ctx.metadata.assemblyMs,
            tiersLoaded: ctx.metadata.tiersLoaded.length,
            assembler: true,
          },
        },
      }
    } catch (assemblerErr) {
      logger.warn('[engine] ContextAssembler failed, falling back to basic prompt', {
        error: assemblerErr instanceof Error ? assemblerErr.message : String(assemblerErr),
        threadId: config.threadId,
      })
      systemPrompt = await buildEntityAwarePrompt(config.supabase, config.orgId, message, userProfile)
      yield {
        type: 'stage',
        data: { stage: 'context_assembly', status: 'done', meta: { promptLength: systemPrompt.length, assemblerFallback: true } },
      }
    }
  } else {
    systemPrompt = await buildEntityAwarePrompt(config.supabase, config.orgId, message, userProfile)
    yield { type: 'stage', data: { stage: 'context_assembly', status: 'done', meta: { promptLength: systemPrompt.length } } }
  }

  if (autoRouted && selection) {
    logger.info(`[model-router] ${selection.purpose}: ${selection.reasoning}`)
  }

  // ── 4. Tool selection: eager tools + deferred tool names in prompt ──
  let tools = config.toolGroups
    ? getAgentTools(config.toolGroups as ToolGroup[])
    : getEagerTools()
  let deferredPromptSection = config.toolGroups ? '' : buildDeferredToolsPrompt()
  let toolNames = tools.map(t => t.name)
  const totalToolCount = tools.length

  const entityCtxMatch = systemPrompt.match(/## Entity Context\n\n([\s\S]*?)(?:\n## |$)/)
  const entityContext = entityCtxMatch?.[1]?.trim() || ''

  let planStages: PlanStage[] = []
  const activatedStages = new Set<string>()
  let toolGroupsApplied = false

  // Haiku planner (non-blocking, 1500ms race window)
  let planPromise: Promise<PlanOutput> | null = null
  if (!isTrivialMessage(message)) {
    planPromise = generatePlan(message, entityContext, toolNames)
      .catch(() => ({ stages: [], toolGroups: [] }) as PlanOutput)
  }

  if (planPromise) {
    const raceResult = await Promise.race([
      planPromise.then(plan => ({ ready: true as const, plan })),
      new Promise<{ ready: false }>(resolve => setTimeout(() => resolve({ ready: false }), 1500)),
    ])
    if (raceResult.ready && raceResult.plan.stages.length > 0) {
      planStages = raceResult.plan.stages
      yield { type: 'plan', data: { stages: planStages } }

      if (raceResult.plan.toolGroups.length > 0) {
        tools = getAgentTools(raceResult.plan.toolGroups as ToolGroup[])
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

  // Tool RAG: second-pass relevance filtering
  const toolRagResult = selectRelevantTools(message, tools, 10)
  if (toolRagResult.excluded.length > 0) {
    tools = toolRagResult.tools
    toolNames = tools.map(t => t.name)
    logger.info('[engine] Tool RAG applied', {
      selected: toolNames,
      excluded: toolRagResult.excluded,
      scores: toolRagResult.scores,
    })
  }

  // ── 5. Build system prompt with tier modifiers + plan + tool summary ─
  const { getTierModifier } = await import('@/lib/agent/tier-prompts')
  let fullSystemPrompt = systemPrompt + getTierModifier(purpose)

  if (planStages.length > 0) {
    const planDescription = planStages
      .map((s, i) => `${i + 1}. ${s.icon} ${s.label}${s.sublabel ? ` (${s.sublabel})` : ''}${s.toolHint ? ` [tool: ${s.toolHint}]` : ''}`)
      .join('\n')
    fullSystemPrompt += `\n\n## Execution Plan\nFollow this plan to fulfill the user's request:\n${planDescription}\n`
  }

  if (toolRagResult.toolSummary) {
    fullSystemPrompt += `\n\n## Available Tools Note\n${toolRagResult.toolSummary}\n`
  }

  if (deferredPromptSection) {
    fullSystemPrompt += deferredPromptSection
  }

  // ── 6. Build initial messages array ────────────────────────────────
  const userMessageContent: string | Anthropic.ContentBlockParam[] = config.contentBlocks?.length
    ? [
        { type: 'text' as const, text: message },
        ...config.contentBlocks,
      ]
    : message

  let messages: Anthropic.MessageParam[]
  if (config.threadId) {
    const historyMessages = [...(config.history || [])]
    if (config.contentBlocks?.length && historyMessages.length > 0) {
      const lastIdx = historyMessages.length - 1
      if (historyMessages[lastIdx].role === 'user') {
        historyMessages[lastIdx] = { role: 'user', content: userMessageContent }
      }
    }
    messages = historyMessages
  } else {
    messages = [...(config.history || []), { role: 'user', content: userMessageContent }]
  }

  userMessages.push(message)

  // Build execution options once (shared across all tool batches)
  const execOptions: ExecuteToolOptions | undefined = config.agentConfigId
    ? {
        agentConfigId: config.agentConfigId,
        orgSettings: config.orgSettings,
        agentType: config.agentType,
        calibratedThresholds: config.calibratedThresholds,
        spawnDepth: config._spawnDepth ?? 0,
        maxSpawnDepth: config.maxDepth ?? 3,
        parentAgentId: config.parentAgentId,
      }
    : undefined

  // ── 7. THE LOOP: Think → Act → Observe → Repeat ───────────────────
  while (iterationCount < SAFETY_CEILING) {
    iterationCount++

    let response: Anthropic.Message
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
          const streamConfig: Record<string, unknown> = {
            model,
            max_tokens: maxTokens,
            system: fullSystemPrompt,
            tools,
            messages,
          }

          // Note: interleaved thinking is GA in SDK v0.74+ (no beta flag needed).
          // Compaction (compact-2026-01-12) remains in beta — use client.beta.messages
          // if re-enabling. For now, context overflow is handled by safety ceiling.

          if (purpose === 'synthesis') {
            streamConfig.thinking = { type: 'enabled', budget_tokens: 8192 }
          }

          const stream = client.messages.stream(streamConfig as Parameters<typeof client.messages.stream>[0])

          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              streamedDeltas.push(event.delta.text)
            } else if (event.type === 'content_block_delta' && (event.delta as unknown as Record<string, unknown>).type === 'thinking_delta') {
              const thinkingDelta = (event.delta as unknown as Record<string, unknown>)['thinking']
              if (typeof thinkingDelta === 'string') {
                streamedThinkingDeltas.push(thinkingDelta)
              }
            } else if (event.type === 'content_block_start' && (event.content_block as unknown as Record<string, unknown>).type === 'thinking') {
              thinkingActive = true
              thinkingStartTime = Date.now()
            } else if (event.type === 'content_block_stop' && thinkingActive) {
              thinkingActive = false
            }
          }

          return stream.finalMessage()
        },
        { threshold: 5, cooldownMs: 60_000 },
      )

      // Yield thinking deltas
      for (const delta of streamedThinkingDeltas) {
        yield { type: 'thinking_delta', data: delta }
      }
      if (thinkingStartTime !== null && streamedThinkingDeltas.length > 0) {
        yield { type: 'thinking_complete', data: { duration_ms: Date.now() - thinkingStartTime } }
      }

      // Yield text deltas (scrubbed)
      for (const delta of streamedDeltas) {
        const scrubbed = scrubLeaks(delta)
        const leak = detectLeak(delta)
        if (leak.leaked) {
          logger.warn('response_leak_detected', { patterns: leak.patterns })
        }
        yield { type: 'content_delta', data: scrubbed }
      }

      yield { type: 'stage', data: { stage: 'api_streaming', status: 'done', meta: { tokens: response.usage } } }

      // Check if late Haiku plan arrived during streaming
      if (planPromise) {
        try {
          const latePlan = await planPromise
          if (latePlan.stages.length > 0 && planStages.length === 0) {
            planStages = latePlan.stages
            yield { type: 'plan', data: { stages: planStages } }

            if (latePlan.toolGroups.length > 0 && !toolGroupsApplied) {
              logger.info('[engine] Late plan arrived with tool groups (not applied — KV cache preservation)', {
                toolGroups: latePlan.toolGroups,
                reason: 'tools already locked for this turn',
              })
            }
          }
        } catch { /* plan failure is non-critical */ }
        planPromise = null
      }
    } catch (err) {
      // Circuit breaker OPEN — temporary, don't write to DLQ
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

      // Unrecoverable API error — write to DLQ
      const errorMsg = err instanceof Error ? err.message : String(err)
      const errorStack = err instanceof Error ? err.stack : undefined
      yield { type: 'error', data: `API error: ${errorMsg}` }

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
    const iterInputTokens = response.usage?.input_tokens || 0
    const iterOutputTokens = response.usage?.output_tokens || 0
    totalInputTokens += iterInputTokens
    totalOutputTokens += iterOutputTokens
    executionTokens += iterInputTokens + iterOutputTokens

    // ── COMPACTION: API summarized the conversation to free context ──
    if ((response as unknown as Record<string, unknown>).stop_reason === 'compaction') {
      logger.info('[taor] Context compaction triggered', {
        iteration: iterationCount,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        totalInputSoFar: totalInputTokens,
      })

      // The compaction block is in response.content. Preserve it as the
      // conversation summary, then continue the loop with fresh context.
      messages = [
        { role: 'assistant', content: response.content },
        { role: 'user', content: '[Context compacted. Continue with the current task. All prior context has been summarized above.]' },
      ]

      yield { type: 'checkpoint', data: { message_index: messages.length, label: 'Context compacted' } }
      continue
    }

    // ── THINK complete — model is done ──────────────────────────────
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
      } else {
        logger.debug('[taor] Run logging skipped — no agentConfigId', { orgId: config.orgId })
      }

      logger.info('ai_response_complete', { model, purpose, tokens: response.usage })
      yield { type: 'done', data: { tokens: response.usage } }
      return
    }

    // ── ACT: execute tool calls ─────────────────────────────────────
    const toolBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )

    // Pre-emit plan stage activations and tool_call events
    const toolMeta: Array<{ tool: Anthropic.ToolUseBlock; matchedStage: PlanStage | null }> = []
    for (const tool of toolBlocks) {
      toolCallCount++

      const matchedStage = planStages.find(s => s.toolHint === tool.name && !activatedStages.has(s.id)) ?? null
      if (matchedStage) {
        yield { type: 'plan_stage_update', data: { stageId: matchedStage.id, status: 'active' } }
        activatedStages.add(matchedStage.id)
      } else if (planStages.length === 0) {
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
      toolMeta.push({ tool, matchedStage })
    }

    // Execute all tools via the parallel executor
    const batchResult = await executeToolBatch(
      toolBlocks,
      config,
      execOptions,
      executionTokens,
      activeRole,
    )

    // Yield batch events (tool_result, stage, budget, citation events)
    for (const event of batchResult.events) {
      yield event
    }
    activeRole = batchResult.activeRole

    // Dynamic tool loading: if resolve_tool was called, add resolved tools to the active set
    for (const tool of toolBlocks) {
      if (tool.name === 'resolve_tool') {
        const toolName = (tool.input as Record<string, unknown>).tool_name as string | undefined
        if (toolName) {
          const resolved = resolveToolSchema(toolName)
          if (resolved && !tools.some(t => t.name === resolved.name)) {
            tools = [...tools, resolved]
          }
        }
      }
    }

    // Emit plan stage completions for matched stages
    for (let t = 0; t < toolMeta.length; t++) {
      const { matchedStage } = toolMeta[t]
      if (matchedStage) {
        // Check if tool succeeded (find corresponding tool_result event)
        const resultEvent = batchResult.events.find(
          e => e.type === 'tool_result' && (e.data as { name: string }).name === toolMeta[t].tool.name,
        )
        const success = resultEvent ? (resultEvent.data as { success: boolean }).success : false
        yield { type: 'plan_stage_update', data: { stageId: matchedStage.id, status: success ? 'done' : 'error' } }
      } else if (planStages.length > 0) {
        const reactiveMatch = planStages.find(s => s.id === toolMeta[t].tool.name)
        if (reactiveMatch) {
          const resultEvent = batchResult.events.find(
            e => e.type === 'tool_result' && (e.data as { name: string }).name === toolMeta[t].tool.name,
          )
          const success = resultEvent ? (resultEvent.data as { success: boolean }).success : false
          yield { type: 'plan_stage_update', data: { stageId: reactiveMatch.id, status: success ? 'done' : 'error' } }
        }
      }
    }

    // ── OBSERVE: append results to conversation ─────────────────────
    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: batchResult.toolResults },
    ]

    // Execution cap convergence: nudge synthesis when token cap exceeded
    if (batchResult.executionCapHit) {
      messages = [
        ...messages,
        {
          role: 'user' as const,
          content: '[SYSTEM: Token budget for this execution reached. Provide your best answer with current information. Do NOT call any more tools.]',
        },
      ]
    }

    // Checkpoint events every 20 messages
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

    // Topic shift detection
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
        logger.debug('[engine] Topic shift detection failed')
      }
    }
  }

  // Safety ceiling hit (should never happen in practice)
  logger.warn('[engine] Safety ceiling reached', { iterations: iterationCount, toolCalls: toolCallCount })

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
    data: finalMessage || 'Safety ceiling reached. Please try again with a more specific request.',
  }
  yield { type: 'done', data: {} }
}

// Backwards-compatible alias
export { runTAORLoop as runAgentChat }
