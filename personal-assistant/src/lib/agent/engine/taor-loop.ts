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
import { getMCPTools, isMCPEnabled } from '@/lib/composio/mcp-session'
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
import { detectLeak, scrubLeaks, guardAndHumanize } from '@/lib/agent/response-guard'
import { logger } from '@/lib/core/logger'
import { detectTopicShift } from '@/lib/agent/citation-extractor'
import { evaluateTurnQuality } from './turn-evaluator'

import { MemoryPalaceService } from '@/lib/memory-palace/service'
import { getAllSkills, getSkillsForRole, resolveSkill, initializeSkillRegistry } from '@/lib/skills/registry'
import { selectRelevantSkills as selectRelevantSkillsRAG } from '@/lib/skills/skill-rag'
import type { ResolvedSkill } from '@/lib/skills/types'

import type { EngineConfig, AgentEvent } from './types'
import { preFlightChecks } from './pre-flight'
import { executeToolBatchStreaming, type ToolExecutionResult } from './tool-executor'
import { resolveEntityOverrides } from '@/lib/agent/entity-overrides'

// ---------------------------------------------------------------------------
// Correction detection for memory contradiction feedback
// ---------------------------------------------------------------------------

const CORRECTION_PATTERNS = [
  /^no[,.]?\s/i,
  /that'?s (?:not |in)?correct/i,
  /that'?s wrong/i,
  /actually[,.]?\s/i,
  /you(?:'re| are) (?:wrong|mistaken|incorrect)/i,
  /(?:wrong|incorrect) (?:amount|price|date|name|number)/i,
]

function isUserCorrection(message: string): boolean {
  return CORRECTION_PATTERNS.some(p => p.test(message.trim()))
}

// ---------------------------------------------------------------------------
// Complexity estimator (fallback when Haiku planner times out)
// ---------------------------------------------------------------------------

function estimateComplexity(
  message: string,
  entityCount: number,
  toolGroupCount: number,
): 'low' | 'medium' | 'high' {
  if (message.length < 50 && entityCount === 0 && toolGroupCount <= 1) return 'low'
  const highSignals = [
    entityCount >= 2,
    toolGroupCount >= 3,
    /\b(last time|compared to|previously|invoice|payment|schedule|deadline|budget|proposal)\b/i.test(message),
  ].filter(Boolean).length
  if (highSignals >= 2) return 'high'
  return 'medium'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Safety ceiling — only for runaway cost protection. The model decides when to stop. */
const SAFETY_CEILING = 50

/** Resolve effective iteration cap: entity override > config > SAFETY_CEILING */

let skillRegistryInitialized = false
async function ensureSkillRegistry(): Promise<void> {
  if (skillRegistryInitialized) return
  await initializeSkillRegistry()
  skillRegistryInitialized = true
}

// ---------------------------------------------------------------------------
// TAOR Loop
// ---------------------------------------------------------------------------

export async function* runTAORLoop(
  message: string,
  config: EngineConfig & { toolGroups?: string[]; _spawnDepth?: number; swarmRole?: string },
): AsyncGenerator<AgentEvent> {
  const startTime = Date.now()
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let iterationCount = 0
  let toolCallCount = 0
  const allToolCallNames: string[] = []
  let finalMessage = ''
  const userMessages: string[] = []
  let lastCheckpointAtMessageCount = 0
  let executionTokens = 0
  let activeRole: string | undefined

  // ── Memory corroboration feedback loop state ───────────────────────
  let previousSurfacedMemoryIds: string[] = []

  // ── Plan persistence state ────────────────────────────────────────
  let planMemoryId: string | null = null

  // ── 1. Pre-flight checks ───────────────────────────────────────────
  const preflight = await preFlightChecks(config, message)
  for (const event of preflight.events) {
    yield event
  }
  if (preflight.blocked) return
  if (preflight.calibratedThresholds) {
    config.calibratedThresholds = preflight.calibratedThresholds
  }

  // ── 1b. Resolve entity overrides (if entity_id provided) ──────────
  if (config.entityId && !config.delegationMandate) {
    const overrides = await resolveEntityOverrides(config.supabase, config.orgId, config.entityId)
    // Merge resolved overrides into config (only if not already explicitly set)
    config = {
      ...config,
      delegationMandate: config.delegationMandate ?? overrides.delegationMandate,
      ltvMultiplier: config.ltvMultiplier ?? overrides.ltvMultiplier,
      iterationCap: config.iterationCap ?? overrides.iterationCap,
      budgetPreset: config.budgetPreset ?? overrides.budgetPreset,
    }
  }

  // ── Resolve entity-aware iteration cap ────────────────────────────
  const effectiveIterationCap = config.iterationCap ?? config.maxIterations ?? SAFETY_CEILING

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

  // ── 2b. Correction detection — penalise previously surfaced memories ──
  if (previousSurfacedMemoryIds.length > 0 && isUserCorrection(message)) {
    try {
      const memService = new MemoryPalaceService(config.supabase, config.orgId)
      for (const memId of previousSurfacedMemoryIds) {
        memService.contradictMemory(memId, 0.15).catch(() => {})
      }
      logger.info('[taor] Correction detected — contradicted surfaced memories', {
        count: previousSurfacedMemoryIds.length,
      })
    } catch {
      // Non-critical: memory feedback is best-effort
    }
  }

  // ── 3. Context assembly ────────────────────────────────────────────
  yield { type: 'stage', data: { stage: 'context_assembly', status: 'start' } }

  const userProfile = (config.userEmail || config.userDisplayName)
    ? { email: config.userEmail, displayName: config.userDisplayName }
    : undefined

  let systemPrompt: string
  if (config.threadId && config.userId) {
    try {
      const assembler = new ContextAssembler({ userProfile, channel: config.channel })
      const ctx = await assembler.assemble(config.supabase, config.userId, config.orgId, config.threadId, message)
      systemPrompt = ctx.systemPrompt
      config.history = ctx.messageHistory
      previousSurfacedMemoryIds = ctx.metadata.surfacedMemoryIds ?? []
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

  // Merge MCP tools if enabled and composio group is active
  if (isMCPEnabled() && (!config.toolGroups || (config.toolGroups as ToolGroup[]).includes('composio'))) {
    const mcpTools = await getMCPTools(config.orgId)
    if (mcpTools.length > 0) {
      const nativeNames = new Set(tools.map(t => t.name))
      const uniqueMcp = mcpTools.filter(t => !nativeNames.has(t.name))
      tools = [...tools, ...uniqueMcp]
      logger.info('[engine] MCP tools merged', { mcpCount: uniqueMcp.length, totalCount: tools.length })
    }
  }

  const deferredPromptSection = config.toolGroups ? '' : buildDeferredToolsPrompt()
  let toolNames = tools.map(t => t.name)
  const totalToolCount = tools.length

  const entityCtxMatch = systemPrompt.match(/## Entity Context\n\n([\s\S]*?)(?:\n## |$)/)
  const entityContext = entityCtxMatch?.[1]?.trim() || ''

  // ── 4b. Skill RAG: select relevant skill candidates ──────────────────
  await ensureSkillRegistry()
  const skillIndex = config.swarmRole
    ? getSkillsForRole(config.swarmRole as import('@/lib/swarm/types').AgentRole)
    : getAllSkills()
  const skillRAGResult = selectRelevantSkillsRAG(message, skillIndex)
  const skillCandidates = skillRAGResult.candidates.length > 0
    ? skillRAGResult.candidates.map(c => ({ id: c.id, description: c.description }))
    : undefined

  if (skillRAGResult.candidates.length > 0) {
    logger.info('[engine] Skill RAG candidates', {
      candidates: skillRAGResult.candidates.map(c => `${c.id}(${c.score})`),
    })
  }

  let planStages: PlanStage[] = []
  const activatedStages = new Set<string>()
  let toolGroupsApplied = false

  // Haiku planner (non-blocking, 1500ms race window)
  let planPromise: Promise<PlanOutput> | null = null
  if (!isTrivialMessage(message)) {
    planPromise = generatePlan(message, entityContext, toolNames, skillCandidates)
      .catch(() => ({ stages: [], toolGroups: [], complexity: 'medium' as const, skills: [] }) as PlanOutput)
  }

  let planComplexity: 'low' | 'medium' | 'high' | null = null
  let resolvedSkills: ResolvedSkill[] = []

  if (planPromise) {
    const raceResult = await Promise.race([
      planPromise.then(plan => ({ ready: true as const, plan })),
      new Promise<{ ready: false }>(resolve => setTimeout(() => resolve({ ready: false }), 1500)),
    ])
    if (raceResult.ready && raceResult.plan.stages.length > 0) {
      planStages = raceResult.plan.stages
      planComplexity = raceResult.plan.complexity

      // Resolve skills selected by planner (with plan gate enforcement)
      if (raceResult.plan.skills && raceResult.plan.skills.length > 0) {
        const { getOrgPlan, checkToolPlanGate } = await import('@/lib/billing/plan-gates')
        const orgPlan = await getOrgPlan(config.supabase, config.orgId)

        for (const skillId of raceResult.plan.skills.slice(0, 2)) {
          const resolved = await resolveSkill(skillId)
          if (!resolved) continue
          if (resolved.entry.planGate) {
            const gate = checkToolPlanGate(orgPlan, resolved.entry.planGate)
            if (!gate.allowed) {
              logger.info('[engine] Skill blocked by plan gate', {
                skillId, requiredPlan: gate.requiredPlan, orgPlan,
              })
              continue
            }
          }
          resolvedSkills.push(resolved)
        }
        if (resolvedSkills.length > 0) {
          logger.info('[engine] Skills activated', {
            skills: resolvedSkills.map(s => s.entry.id),
            totalTokens: resolvedSkills.reduce((sum, s) => sum + s.entry.estimatedTokens, 0),
          })
        }
      }

      // Merge skill tool groups into planner's tool groups for coordinated routing
      const combinedToolGroups: ToolGroup[] = [...(raceResult.plan.toolGroups as ToolGroup[] ?? [])]
      for (const skill of resolvedSkills) {
        const skillGroup = skill.entry.toolGroup as ToolGroup | undefined
        if (skillGroup && !combinedToolGroups.includes(skillGroup)) {
          combinedToolGroups.push(skillGroup)
        }
      }

      // Apply combined tool groups (planner + skill tool groups)
      if (combinedToolGroups.length > 0) {
        tools = getAgentTools(combinedToolGroups as ToolGroup[])

        // Merge MCP tools when composio group is selected by planner
        if (isMCPEnabled() && combinedToolGroups.includes('composio' as ToolGroup)) {
          const mcpTools = await getMCPTools(config.orgId)
          if (mcpTools.length > 0) {
            const nativeNames = new Set(tools.map(t => t.name))
            const uniqueMcp = mcpTools.filter(t => !nativeNames.has(t.name))
            tools = [...tools, ...uniqueMcp]
            logger.info('[engine] MCP tools merged (planner)', { mcpCount: uniqueMcp.length })
          }
        }

        toolNames = tools.map(t => t.name)
        toolGroupsApplied = true
        logger.info('[engine] Tool groups selected', {
          toolGroups: combinedToolGroups,
          fromPlanner: raceResult.plan.toolGroups,
          fromSkills: resolvedSkills.filter(s => s.entry.toolGroup).map(s => s.entry.toolGroup),
          toolCount: tools.length,
          totalAvailable: totalToolCount,
        })
      }

      // Register skill-specific tools that aren't part of a standard tool group
      for (const skill of resolvedSkills) {
        if (skill.tools && skill.tools.length > 0) {
          const skillTools: Anthropic.Tool[] = skill.tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema as Anthropic.Tool.InputSchema,
          }))
          tools = [...tools, ...skillTools.filter(st => !tools.some(t => t.name === st.name))]
          toolNames = tools.map(t => t.name)
        }
      }

      yield { type: 'plan', data: { stages: planStages } }

      // Persist plan as a pattern memory (fast decay — unproven until completed)
      if (planStages.length > 0 && config.threadId) {
        try {
          const palace = new MemoryPalaceService(config.supabase, config.orgId)
          planMemoryId = await palace.createMemory({
            memoryType: 'pattern',
            title: `Plan: ${planStages.map(s => s.label).join(' -> ')}`,
            content: JSON.stringify({
              stages: planStages,
              userMessage: message.slice(0, 200),
              toolGroups: combinedToolGroups,
            }),
            typeMetadata: {
              plan_type: 'taor_execution',
              stage_count: planStages.length,
              status: 'active',
            },
            confidence: 0.4,
            decayRate: 'fast',
            sourceType: 'agent_reflection',
            sourceThreadId: config.threadId,
          })
        } catch {
          // Plan memory creation is non-critical
        }
      }

      planPromise = null
    }
  }

  // Tool RAG: second-pass relevance filtering
  const toolRagResult = selectRelevantTools(message, tools, 16)
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

  // Inject activated skill prompts
  if (resolvedSkills.length > 0) {
    let skillSection = '\n\n### Active Skills\nThe following domain skills are active for this turn:\n'
    for (const skill of resolvedSkills) {
      skillSection += `\n#### ${skill.entry.name}\n${skill.prompt}\n`
    }
    fullSystemPrompt += skillSection
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
  while (iterationCount < effectiveIterationCap) {
    iterationCount++

    // Signal the frontend that a new synthesis pass is starting (iteration 2+ = post-tool)
    if (iterationCount > 1) {
      yield { type: 'synthesis_start', data: { iteration: iterationCount } }
    }

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

          // Complexity-gated extended thinking (Sub-project A)
          const complexity = planComplexity
            ?? estimateComplexity(message, 0, planStages.length)

          if (complexity === 'high') {
            streamConfig.thinking = { type: 'enabled', budget_tokens: 8192 }
          } else if (complexity === 'medium') {
            streamConfig.thinking = { type: 'enabled', budget_tokens: 2048 }
          }
          // complexity === 'low': no thinking

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
      const humanizedText = guardAndHumanize(text)
      const leak = detectLeak(text)
      if (leak.leaked) {
        logger.warn('response_leak_detected', { patterns: leak.patterns })
      }
      finalMessage = humanizedText
      yield { type: 'message', data: humanizedText }

      // Positive feedback: corroborate surfaced memories on successful completion
      if (previousSurfacedMemoryIds.length > 0) {
        try {
          const memService = new MemoryPalaceService(config.supabase, config.orgId)
          for (const memId of previousSurfacedMemoryIds) {
            memService.corroborateMemory(memId, 0.02).catch(() => {})
          }
          logger.info('[taor] Corroborated surfaced memories on success', {
            count: previousSurfacedMemoryIds.length,
          })
        } catch {
          // Non-critical: memory feedback is best-effort
        }
      }

      // Plan persistence: update plan memory with execution results
      if (planMemoryId) {
        const completedStages = planStages.filter(s => activatedStages.has(s.id))
        const allCompleted = completedStages.length === planStages.length

        // Update plan memory with actual execution data (fire-and-forget)
        Promise.resolve(
          config.supabase
            .from('memory_palace_entries')
            .update({
              metadata: {
                plan_type: 'taor_execution',
                status: allCompleted ? 'completed' : 'partial',
                stages_completed: completedStages.length,
                stages_total: planStages.length,
                iterations: iterationCount,
                completed_at: new Date().toISOString(),
              },
            })
            .eq('id', planMemoryId)
            .eq('org_id', config.orgId)
        ).catch(() => {})

        // Promote successful multi-stage plans to lesson_learned
        if (allCompleted && planStages.length >= 2) {
          const palace = new MemoryPalaceService(config.supabase, config.orgId)
          palace.createMemory({
            memoryType: 'lesson_learned',
            title: `Successful approach: ${planStages[0].label}`,
            content: `For "${message.slice(0, 100)}", the approach ${planStages.map(s => s.label).join(' -> ')} worked. Completed in ${iterationCount} iterations.`,
            typeMetadata: {
              plan_stages: planStages.map(s => s.label),
              iterations: iterationCount,
              original_plan_id: planMemoryId,
            },
            confidence: 0.7,
            decayRate: 'slow',
            sourceType: 'agent_reflection',
            sourceThreadId: config.threadId,
          }).catch(() => {})

          // Mark plan memory as inactive (superseded by lesson)
          Promise.resolve(
            config.supabase
              .from('memory_palace_entries')
              .update({ is_active: false })
              .eq('id', planMemoryId)
              .eq('org_id', config.orgId)
          ).catch(() => {})
        }
      }

      // Mark remaining plan stages as done
      for (const stage of planStages) {
        if (!activatedStages.has(stage.id)) {
          yield { type: 'plan_stage_update', data: { stageId: stage.id, status: 'done' } }
          activatedStages.add(stage.id)
        }
      }

      // Log successful run
      let runResult: { id: string } | null = null
      if (config.agentConfigId) {
        runResult = await logAgentRun(config.supabase, {
          org_id: config.orgId,
          agent_config_id: config.agentConfigId,
          trigger_type: 'chat',
          trigger_payload: {
            message,
            ...(resolvedSkills.length > 0 && {
              skills_activated: resolvedSkills.map(s => s.entry.id),
              skills_tokens: resolvedSkills.reduce((sum, s) => sum + s.entry.estimatedTokens, 0),
            }),
            ...(skillRAGResult.candidates.length > 0 && {
              skill_candidates: skillRAGResult.candidates.map(c => `${c.id}(${c.score})`),
            }),
          },
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

      // Fire-and-forget quality evaluation (Sub-project D)
      const complexity = planComplexity ?? estimateComplexity(message, 0, planStages.length)
      if (runResult && complexity !== 'low') {
        evaluateTurnQuality({
          run_id: runResult.id,
          message,
          tool_calls: allToolCallNames,
          plan_stages: planStages.length,
          surfaced_memory_ids: previousSurfacedMemoryIds,
          response_excerpt: text.slice(0, 500),
          iteration_count: iterationCount,
          model_used: model,
          complexity,
        }, config.supabase).catch(() => {}) // truly fire-and-forget
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
      allToolCallNames.push(tool.name)

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
      yield { type: 'tool_call', data: { callId: tool.id, name: tool.name, input: tool.input } }
      toolMeta.push({ tool, matchedStage })
    }

    // Execute all tools — streams results in completion order with heartbeats
    const batchGen = executeToolBatchStreaming(
      toolBlocks,
      config,
      execOptions,
      executionTokens,
      activeRole,
    )

    // Consume generator: yields events as each tool completes
    const toolOutcomes = new Map<string, boolean>() // callId → success
    let batchResult!: ToolExecutionResult
    while (true) {
      const { value, done } = await batchGen.next()
      if (done) {
        batchResult = value
        break
      }
      // Track tool outcomes for plan stage updates
      if (value.type === 'tool_result') {
        const data = value.data as { callId?: string; success: boolean }
        if (data.callId) toolOutcomes.set(data.callId, data.success)
      }
      yield value
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
        const success = toolOutcomes.get(toolMeta[t].tool.id) ?? false
        yield { type: 'plan_stage_update', data: { stageId: matchedStage.id, status: success ? 'done' : 'error' } }
      } else if (planStages.length > 0) {
        const reactiveMatch = planStages.find(s => s.id === toolMeta[t].tool.name)
        if (reactiveMatch) {
          const success = toolOutcomes.get(toolMeta[t].tool.id) ?? false
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
