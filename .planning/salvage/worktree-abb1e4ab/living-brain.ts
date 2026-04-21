/**
 * Living Brain Adapter — BrainPort implementation backed by the Living Brain subsystems.
 *
 * Wraps the existing brain modules (context-assembler, prompt-cache, global-workspace,
 * proactive-recall, dossier-compiler) behind the BrainPort interface.
 *
 * Three tiers determine the depth of context assembly:
 *
 *   minimal — System prompt only (no history, no RAG, no entities).
 *             Fast path for classify/extract/score roles.
 *
 *   standard — System prompt + recent history + proactive recall + key facts.
 *              Good for followup/reflect/digest roles.
 *
 *   full    — Everything: prompt cache, global workspace, entity dossiers,
 *              proactive recall, compressed history, predictive context.
 *              For plan/research/turn roles that need maximum context.
 *
 * The adapter uses the service-role Supabase client for data access (the brain
 * runs in background/agent context, not in a user session).
 *
 * If Supabase is not configured (missing env vars), the adapter degrades
 * gracefully to NullBrainAdapter behavior (empty context, no crash).
 */

import type { BrainPort, AssembledContext, Outcome } from '../ports'
import type { BrainSpec, Trace } from '../types'
import { logger } from '@/lib/core/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LivingBrainOpts {
  /**
   * Override the Supabase client factory for testing.
   * Default: () => getServiceClient() from service-client.ts.
   */
  getSupabase?: () => import('@supabase/supabase-js').SupabaseClient
}

// ─── Tier Configuration ─────────────────────────────────────────────────────

interface TierConfig {
  tokenBudget: number
  maxRecentTurns: number
  maxCompressedTurns: number
  maxEntities: number
  includePendingActions: boolean
  includeCompressedHistory: boolean
  useGlobalWorkspace: boolean
  usePromptCache: boolean
}

const TIER_CONFIGS: Record<Exclude<import('../types').BrainTier, 'none'>, TierConfig> = {
  minimal: {
    tokenBudget: 8_000,
    maxRecentTurns: 0,
    maxCompressedTurns: 0,
    maxEntities: 0,
    includePendingActions: false,
    includeCompressedHistory: false,
    useGlobalWorkspace: false,
    usePromptCache: false,
  },
  standard: {
    tokenBudget: 32_000,
    maxRecentTurns: 10,
    maxCompressedTurns: 20,
    maxEntities: 3,
    includePendingActions: true,
    includeCompressedHistory: true,
    useGlobalWorkspace: false,
    usePromptCache: false,
  },
  full: {
    tokenBudget: 48_000,
    maxRecentTurns: 20,
    maxCompressedTurns: 40,
    maxEntities: 5,
    includePendingActions: true,
    includeCompressedHistory: true,
    useGlobalWorkspace: true,
    usePromptCache: true,
  },
}

// ─── Exported for tests ─────────────────────────────────────────────────────

export { TIER_CONFIGS }

// ─── LivingBrainAdapter ─────────────────────────────────────────────────────

export class LivingBrainAdapter implements BrainPort {
  private getSupabase: LivingBrainOpts['getSupabase']

  constructor(opts?: LivingBrainOpts) {
    this.getSupabase = opts?.getSupabase
  }

  /**
   * Resolve the Supabase client. Uses the injected factory or falls back
   * to the singleton service client. Returns null if not configured.
   */
  private resolveSupabase(): import('@supabase/supabase-js').SupabaseClient | null {
    if (this.getSupabase) {
      try {
        return this.getSupabase()
      } catch {
        return null
      }
    }

    try {
      // Dynamic import to avoid requiring env vars at module load time
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getServiceClient, isServiceClientConfigured } = require('@/lib/supabase/service-client')
      if (!isServiceClientConfigured()) return null
      return getServiceClient()
    } catch {
      return null
    }
  }

  /**
   * Assemble context for an AI invocation based on the requested brain tier.
   *
   * Degrades gracefully: if Supabase is unavailable or any subsystem fails,
   * returns empty context (same as NullBrainAdapter) rather than throwing.
   */
  async assemble(spec: BrainSpec, trace: Trace): Promise<AssembledContext> {
    const tierConfig = TIER_CONFIGS[spec.tier]
    const startMs = performance.now()

    const supabase = this.resolveSupabase()
    if (!supabase) {
      logger.warn('[living-brain] Supabase not available, returning empty context', {
        tier: spec.tier,
        traceId: trace.traceId,
      })
      return this.emptyContext(startMs)
    }

    try {
      // Dynamic import to avoid circular dependencies at module load time.
      // The context-assembler has heavy transitive imports (Anthropic SDK, RAG, etc.)
      // that should only be loaded when actually needed.
      const { ContextAssembler } = await import('@/lib/context-assembly/context-assembler')

      const assembler = new ContextAssembler({
        tokenBudget: tierConfig.tokenBudget,
        maxRecentTurns: tierConfig.maxRecentTurns,
        maxCompressedTurns: tierConfig.maxCompressedTurns,
        maxEntities: tierConfig.maxEntities,
        includePendingActions: tierConfig.includePendingActions,
        includeCompressedHistory: tierConfig.includeCompressedHistory,
        useGlobalWorkspace: tierConfig.useGlobalWorkspace,
        usePromptCache: tierConfig.usePromptCache,
      })

      // The ContextAssembler.assemble() requires userId, orgId, threadId, and a message.
      // We use the trace's orgId. For threadId, we use the spec's threadId or a synthetic one.
      // For the current message, we use an empty string (the actual message is in the
      // ResolvedRequest.messages -- the brain provides context, not the query).
      const threadId = spec.threadId ?? `synthetic-${trace.traceId}`
      const currentMessage = '' // Context assembly does not need the query text for system prompt

      const assembled = await assembler.assemble(
        supabase,
        trace.userId ?? trace.orgId,
        trace.orgId,
        threadId,
        currentMessage,
      )

      const assemblyMs = Math.round(performance.now() - startMs)

      logger.info('[living-brain] Context assembled', {
        tier: spec.tier,
        traceId: trace.traceId,
        assemblyMs,
        tokenTotal: assembled.metadata.tokenUsage.total,
        tiersLoaded: assembled.metadata.tiersLoaded.filter(t => t.loaded).length,
        entityMentions: assembled.metadata.entityMentions.length,
      })

      return assembled
    } catch (err) {
      const assemblyMs = Math.round(performance.now() - startMs)
      logger.error('[living-brain] Assembly failed, returning empty context', {
        tier: spec.tier,
        traceId: trace.traceId,
        assemblyMs,
        error: err instanceof Error ? err.message : String(err),
      })
      return this.emptyContext(startMs)
    }
  }

  /**
   * Record feedback for a completed AI invocation.
   *
   * Currently logs the outcome for observability. Future plans:
   * - Write to ai_invocation_log for cost tracking
   * - Feed outcomes to spreading activation / neural decay
   * - Update entity trust scores based on correction outcomes
   */
  async recordFeedback(traceId: string, outcome: Outcome): Promise<void> {
    logger.debug('[living-brain] Feedback recorded', {
      traceId,
      status: outcome.status,
    })
  }

  /**
   * Returns the same empty context as NullBrainAdapter for graceful degradation.
   */
  private emptyContext(startMs: number): AssembledContext {
    return {
      systemPrompt: '',
      messageHistory: [],
      metadata: {
        tokenUsage: {
          systemPrompt: 0,
          entityContext: 0,
          recentTurns: 0,
          compressedHistory: 0,
          keyFacts: 0,
          pendingActions: 0,
          retrievedContext: 0,
          skillPrompts: 0,
          executionContext: 0,
          total: 0,
          budget: 0,
          overBudget: false,
        },
        tiersLoaded: [],
        assemblyMs: Math.round(performance.now() - startMs),
        entityMentions: [],
        pendingActionCount: 0,
        surfacedMemoryIds: [],
      },
    }
  }
}
