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
import { callModelViaGateway, type AnthropicLikeResponse, type GatewayCallConfig } from '@/lib/ai/gateway-adapter'
import { models as gatewayModels } from '@/lib/ai'
import { getAgentTools, type ExecuteToolOptions, type ToolGroup } from '@/lib/agent/tools'
import { getEagerTools, buildDeferredToolsPrompt, resolveToolSchema } from '@/lib/agent/tools/deferred-loader'
import { getComposioToolsForOrg } from '@/lib/composio/tool-provider'
import { isComposioEnabled } from '@/lib/composio/client'
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
import { classifyQueryComplexity, type QueryComplexity } from '@/lib/brain/query-gate'

import { MemoryPalaceService } from '@/lib/memory-palace/service'
import { getAllSkills, getSkillsForRole, resolveSkill, initializeSkillRegistry } from '@/lib/skills/registry'
import { selectRelevantSkills as selectRelevantSkillsRAG } from '@/lib/skills/skill-rag'
import type { ResolvedSkill } from '@/lib/skills/types'

import type { EngineConfig, AgentEvent } from './types'
import { preFlightChecks } from './pre-flight'
import { executeToolBatchStreaming, type ToolExecutionResult } from './tool-executor'
import { resolveEntityOverrides } from '@/lib/agent/entity-overrides'
import { detectDelegationIntent, resolveEntityCandidates, generateActivationConfirmation, generateRevocationConfirmation, generateAmbiguityClarification } from '@/lib/agent/delegation-intent'
import { setEntityMandate, revokeEntityMandate, getEntityMandate } from '@/lib/agent/delegation-mandate'
import { buildTaorExecOptions, mergeEntityOverrides } from './taor-loop-utils'
import { buildTierContextBlock } from './tool-resolver'
import { generateFollowUps } from '@/lib/agent/follow-up-generator'
import { retrieveRelevantTraces, formatTracesAsContext } from './decision-trace-retriever'

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

  // ── 1b. Resolve entity overrides + active delegation mandate ──────
  // Two sources of "what's the delegation posture for this entity":
  //   1. entity_overrides table (legacy / admin-set overrides, plus ltvMultiplier etc.)
  //   2. delegation_mandates table (canonical source; written by NL activation
  //      in step 1c, by /api/delegation, and by direct calls to setEntityMandate)
  // delegation_mandates wins when both sources have a value — it's the live,
  // user-facing mandate. Without this, a mandate activated via NL in a prior
  // turn would never take effect on subsequent turns (the bypass would stay dead).
  if (config.entityId && !config.delegationMandate) {
    const [overrides, activeMandate] = await Promise.all([
      resolveEntityOverrides(config.supabase, config.orgId, config.entityId),
      getEntityMandate(config.supabase, config.orgId, config.entityId),
    ])
    config = mergeEntityOverrides(config, {
      mandateFromMandatesTable: activeMandate?.mandate_level,
      overridesFromOverridesTable: overrides,
    })
  }

  // ── 1c. NL delegation intent detection (before model call) ────────
  const delegationIntent = detectDelegationIntent(message)
  if (delegationIntent && delegationIntent.confidence >= 0.6) {
    try {
      const candidates = await resolveEntityCandidates(
        config.supabase,
        config.orgId,
        delegationIntent.entityMention,
      )

      // Ambiguity guard: when the mention matches multiple entities, ask
      // the user to disambiguate rather than acting on the wrong one.
      // Critical for revocation — we don't want to silently revoke the
      // wrong mandate.
      if (candidates.length > 1) {
        const clarification = generateAmbiguityClarification(
          delegationIntent.entityMention,
          candidates,
        )
        logger.info('[taor] Delegation intent ambiguous — asking user to disambiguate', {
          mention: delegationIntent.entityMention,
          candidateCount: candidates.length,
          type: delegationIntent.type,
        })
        yield { type: 'message', data: clarification }
        yield { type: 'done', data: {} }
        return
      }

      const entity = candidates[0] ?? null
      if (entity) {
        if (delegationIntent.type === 'activate') {
          await setEntityMandate(
            config.supabase,
            config.orgId,
            entity.id,
            'infinite_autopilot',
            (config.channel ?? "whatsapp") as any,
          )
          const confirmation = generateActivationConfirmation(entity.name)
          logger.info('[taor] Delegation activated via NL', {
            entityId: entity.id,
            entityName: entity.name,
            mention: delegationIntent.entityMention,
            confidence: delegationIntent.confidence,
          })
          yield { type: 'message', data: confirmation }
          yield { type: 'done', data: {} }
          return
        } else {
          const revoked = await revokeEntityMandate(
            config.supabase,
            config.orgId,
            entity.id,
            (config.channel ?? "whatsapp") as any,
          )
          if (revoked) {
            const confirmation = generateRevocationConfirmation(entity.name)
            logger.info('[taor] Delegation revoked via NL', {
              entityId: entity.id,
              entityName: entity.name,
              mention: delegationIntent.entityMention,
              confidence: delegationIntent.confidence,
            })
            yield { type: 'message', data: confirmation }
            yield { type: 'done', data: {} }
            return
          }
          // No active mandate to revoke — fall through to normal processing
          logger.info('[taor] Revocation intent but no active mandate, continuing', {
            entityName: entity.name,
          })
        }
      } else {
        logger.info('[taor] Delegation intent detected but entity not found', {
          mention: delegationIntent.entityMention,
          type: delegationIntent.type,
        })
        // Entity not found — fall through to normal processing
      }
    } catch (err) {
      logger.warn('[taor] Delegation intent processing failed, continuing', {
        error: err instanceof Error ? err.message : String(err),
      })
      // Non-critical: fall through to normal processing
    }
  }

  // ── Resolve entity-aware iteration cap ────────────────────────────
  const effectiveIterationCap = config.iterationCap ?? config.maxIterations ?? SAFETY_CEILING

  // Model resolved below — calls route through Vercel AI Gateway

  // ── 2. Model routing (via AI Gateway) ──────────────────────────────
  yield { type: 'stage', data: { stage: 'model_routing', status: 'start' } }
  const autoRouted = !config.model
  const selection = autoRouted ? selectModel(message) : null
  const purpose: ModelPurpose = selection?.purpose || 'conversation'
  // Resolve to gateway model IDs (provider/model format)
  const gatewayModelMap: Record<ModelPurpose, string> = {
    classification: gatewayModels.fast,
    conversation: gatewayModels.balanced,
    synthesis: gatewayModels.heavy,
  }
  const model = config.model || gatewayModelMap[purpose] || gatewayModels.balanced
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

  // ── 2c. System 1/2 query gate ──────────────────────────────────────
  const queryComplexity: QueryComplexity = classifyQueryComplexity(message, {
    entityMentionCount: delegationIntent?.entityMention ? 1 : 0,
  })
  logger.info('[taor] Query gated', { complexity: queryComplexity })

  // ── 3. Context assembly ────────────────────────────────────────────
  yield { type: 'stage', data: { stage: 'context_assembly', status: 'start' } }

  const userProfile = (config.userEmail || config.userDisplayName)
    ? { email: config.userEmail, displayName: config.userDisplayName }
    : undefined

  // System 1 queries use reduced assembler config for fast path (<50ms)
  const assemblerOverrides = queryComplexity === 'system1'
    ? { maxEntities: 3, includeCompressedHistory: false }
    : {}

  let systemPrompt: string
  if (config.threadId && config.userId) {
    try {
      const assembler = new ContextAssembler({ userProfile, channel: config.channel, ...assemblerOverrides })
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

  // Merge Composio tools for the user's connected apps
  if (isComposioEnabled()) {
    const { tools: composioTools } = await getComposioToolsForOrg(config.orgId, config.supabase)
    if (composioTools.length > 0) {
      const nativeNames = new Set(tools.map(t => t.name))
      const uniqueComposio = composioTools.filter(t => !nativeNames.has(t.name))
      tools = [...tools, ...uniqueComposio]
      logger.info('[engine] Composio tools merged', { composioCount: uniqueComposio.length, totalCount: tools.length })
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

        // Merge Composio tools for connected apps (always, not just when composio group selected)
        if (isComposioEnabled()) {
          const { tools: composioTools } = await getComposioToolsForOrg(config.orgId, config.supabase)
          if (composioTools.length > 0) {
            const nativeNames = new Set(tools.map(t => t.name))
            const uniqueComposio = composioTools.filter(t => !nativeNames.has(t.name))
            tools = [...tools, ...uniqueComposio]
            logger.info('[engine] Composio tools merged (planner)', { composioCount: uniqueComposio.length })
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

  // Inject tier context when browser or workspace tools are available
  const hasTieredTools = toolNames.some(
    n => n === 'spawn_browser_agent' || n === 'spawn_ephemeral_workspace',
  )
  if (hasTieredTools) {
    try {
      const tierBlock = await buildTierContextBlock(config.supabase, config.orgId)
      if (tierBlock) {
        fullSystemPrompt += `\n\n${tierBlock}\n`
      }
    } catch (err) {
      logger.warn('[engine] Tier context injection failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (deferredPromptSection) {
    fullSystemPrompt += deferredPromptSection
  }

  // Voice-mode prompt fragment.
  //
  // Appended AFTER the cached prefix so prompt-cache hits are preserved —
  // never inline this inside the cached system prompt block or every voice
  // turn invalidates the cache.
  if (config.voiceMode) {
    fullSystemPrompt += `\n\n## Voice Mode\nYou are being consumed over a realtime voice channel. Respond in 1-3 short sentences unless the user explicitly asks for detail. Avoid markdown, bullet lists, tables, and code fences — they cannot be spoken naturally. Use natural contractions ("I'll", "you're", "that's"). Confirm before destructive actions. If the user asks for data that's best shown visually (a table, a list of many items, code), give a brief spoken summary and note that the full result is on screen.\n`
  }

  // Inject past decision traces for reflexion learning (non-blocking, best-effort)
  if (queryComplexity !== 'system1') {
    try {
      const traceResult = await retrieveRelevantTraces(
        config.supabase,
        config.orgId,
        message,
        { entityId: config.entityId, limit: 5 },
      )
      const traceBlock = formatTracesAsContext(traceResult.traces)
      if (traceBlock) {
        fullSystemPrompt += `\n\n${traceBlock}\n`
        logger.info('[engine] Decision traces injected', {
          count: traceResult.traces.length,
          retrievalMs: traceResult.retrievalMs,
        })
      }
    } catch (err) {
      logger.warn('[engine] Decision trace injection failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
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

  // Build execution options once (shared across all tool batches).
  // Uses buildTaorExecOptions to ensure Phase 43 delegation plumbing
  // (delegationMandate, entityId) is threaded through from the engine config.
  const execOptions: ExecuteToolOptions | undefined = buildTaorExecOptions(config)

  // ── 7. THE LOOP: Think → Act → Observe → Repeat ───────────────────
  while (iterationCount < effectiveIterationCap) {
    // Voice barge-in / external cancellation: exit before starting a new
    // iteration. The current Anthropic stream (if any) is not forcibly aborted
    // here — the caller is responsible for dropping any in-flight TTS and
    // ignoring remaining yields.
    if (config.abortSignal?.aborted) {
      yield { type: 'done', data: { aborted: true } }
      return
    }

    iterationCount++

    // Signal the frontend that a new synthesis pass is starting (iteration 2+ = post-tool)
    if (iterationCount > 1) {
      yield { type: 'synthesis_start', data: { iteration: iterationCount } }
    }

    let response: AnthropicLikeResponse
    let streamedDeltas: string[] = []
    let streamedThinkingDeltas: string[] = []
    let thinkingStartTime: number | null = null

    try {
      yield { type: 'stage', data: { stage: 'api_streaming', status: 'start', meta: { iteration: iterationCount } } }

      const agentType = config.agentType || 'default'

      // Complexity-gated extended thinking
      const complexity = planComplexity
        ?? estimateComplexity(message, 0, planStages.length)

      const thinking = complexity === 'high'
        ? { type: 'enabled' as const, budget_tokens: 8192 }
        : complexity === 'medium'
          ? { type: 'enabled' as const, budget_tokens: 2048 }
          : undefined

      const gatewayResult = await withCircuitBreaker(
        `gateway:${agentType}`,
        () => callModelViaGateway({
          model,
          maxTokens,
          system: fullSystemPrompt,
          tools,
          messages: messages as unknown as GatewayCallConfig['messages'],
          thinking,
        }),
        { threshold: 5, cooldownMs: 60_000 },
      )

      response = gatewayResult.response
      streamedDeltas = gatewayResult.streamedDeltas
      streamedThinkingDeltas = gatewayResult.streamedThinkingDeltas
      thinkingStartTime = gatewayResult.thinkingStartTime

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
      logger.error('[engine] Unrecoverable API error', { error: errorMsg, stack: errorStack, model, iteration: iterationCount })
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
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
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

      // Generate follow-up suggestions (adds up to 3s latency, capped by timeout)
      try {
        const followUps = await generateFollowUps(message, humanizedText)
        if (followUps.length > 0) {
          yield { type: 'follow_ups', data: { suggestions: followUps } }
        }
      } catch {
        // Silent — follow-ups are non-critical
      }

      logger.info('ai_response_complete', { model, purpose, tokens: response.usage })
      yield { type: 'done', data: { tokens: response.usage } }
      return
    }

    // ── ACT: execute tool calls ─────────────────────────────────────
    type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown }
    const toolBlocks = response.content.filter(
      (b): b is ToolUseBlock => b.type === 'tool_use',
    )

    // Pre-emit plan stage activations and tool_call events
    const toolMeta: Array<{ tool: ToolUseBlock; matchedStage: PlanStage | null }> = []
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
    // Cast response.content for Anthropic MessageParam compatibility (gateway adapter bridge)
    messages = [
      ...messages,
      { role: 'assistant', content: response.content as Anthropic.ContentBlock[] },
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
