/**
 * Global Workspace — Competitive Context Selection
 *
 * Implements Global Workspace Theory for memory module competition.
 * Memory modules (entity dossier, decision, pattern, financial, temporal,
 * fiduciary) compete for context budget based on query relevance.
 *
 * Replaces fixed 4-tier allocation with dynamic competitive allocation.
 * Most relevant memories get the most budget, improving context quality per token.
 */

import { logger } from '@/lib/core/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MemoryModule {
  name: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  minTokens: number
  maxTokens: number
  scoreRelevance: (query: string, context: ModuleContext) => number // 0-1
}

export interface ModuleContext {
  entityMentions: string[]
  queryComplexity: 'system1' | 'system2'
  hasFinancialSignals: boolean
  hasDecisionSignals: boolean
  hasTemporalSignals: boolean
}

export interface ModuleAllocation {
  moduleName: string
  tokenBudget: number
  relevance: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const PRIORITY_WEIGHTS: Record<MemoryModule['priority'], number> = {
  critical: 10,
  high: 5,
  medium: 3,
  low: 1,
}

// ─── Signal Detection Regexes ───────────────────────────────────────────────

const FINANCIAL_REGEX = /\b(invoice|payment|cost|price|budget|expense|billing|revenue|profit|fee|charge|refund|receipt|quote|estimate)\b/i
const DECISION_REGEX = /\b(should\s+i|decide|decision|choose|option|recommend|compare|trade-?off|pros?\s+and\s+cons?|alternative|weigh)\b/i
const TEMPORAL_REGEX = /\b(deadline|schedule|due\s+date|overdue|upcoming|reminder|calendar|appointment|tomorrow|next\s+week|by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|end\s+of))\b/i

// ─── Module Context Detection ───────────────────────────────────────────────

/**
 * Detect module context signals from a query string.
 * Used to build ModuleContext when entity mentions are already known.
 */
export function detectModuleContext(query: string, entityMentions: string[] = []): ModuleContext {
  return {
    entityMentions,
    queryComplexity: query.length > 100 ? 'system2' : 'system1',
    hasFinancialSignals: FINANCIAL_REGEX.test(query),
    hasDecisionSignals: DECISION_REGEX.test(query),
    hasTemporalSignals: TEMPORAL_REGEX.test(query),
  }
}

// ─── Default Memory Modules ─────────────────────────────────────────────────

export const MEMORY_MODULES: MemoryModule[] = [
  {
    name: 'fiduciary',
    priority: 'critical',
    minTokens: 200,
    maxTokens: 500,
    scoreRelevance: () => 1.0, // Safety override: always included
  },
  {
    name: 'entity_dossier',
    priority: 'high',
    minTokens: 500,
    maxTokens: 4000,
    scoreRelevance: (_query: string, context: ModuleContext) => {
      const count = context.entityMentions.length
      if (count === 0) return 0
      // Scale from 0.3 (1 mention) up to 0.9 (5+ mentions)
      return Math.min(0.3 + count * 0.15, 0.9)
    },
  },
  {
    name: 'decision_memory',
    priority: 'high',
    minTokens: 200,
    maxTokens: 2000,
    scoreRelevance: (_query: string, context: ModuleContext) => {
      return context.hasDecisionSignals ? 0.8 : 0.0
    },
  },
  {
    name: 'financial_memory',
    priority: 'medium',
    minTokens: 200,
    maxTokens: 2000,
    scoreRelevance: (_query: string, context: ModuleContext) => {
      return context.hasFinancialSignals ? 0.8 : 0.0
    },
  },
  {
    name: 'temporal_memory',
    priority: 'medium',
    minTokens: 500,
    maxTokens: 3000,
    scoreRelevance: (_query: string, context: ModuleContext) => {
      return context.hasTemporalSignals ? 0.7 : 0.3
    },
  },
  {
    name: 'pattern_memory',
    priority: 'medium',
    minTokens: 200,
    maxTokens: 1500,
    scoreRelevance: (_query: string, context: ModuleContext) => {
      return context.entityMentions.length > 0 ? 0.4 : 0.1
    },
  },
  {
    name: 'warning_memory',
    priority: 'low',
    minTokens: 100,
    maxTokens: 500,
    scoreRelevance: () => 0.2, // Low baseline
  },
]

// ─── Allocation Algorithm ───────────────────────────────────────────────────

/**
 * Competitive context budget allocation using Global Workspace Theory.
 *
 * Algorithm:
 * 1. Score all modules against query and context
 * 2. Filter out irrelevant modules (relevance < 0.1), keeping critical priority
 * 3. Sort by effective score (relevance * priority weight) descending
 * 4. Greedy allocation respecting min/max token bounds
 * 5. Total allocation never exceeds totalBudget
 */
export function allocateContextBudget(
  query: string,
  totalBudget: number,
  context: ModuleContext,
  modules: MemoryModule[] = MEMORY_MODULES,
): ModuleAllocation[] {
  // Step 1: Score all modules
  const scored = modules.map((mod) => ({
    module: mod,
    relevance: mod.scoreRelevance(query, context),
    effectiveScore: mod.scoreRelevance(query, context) * PRIORITY_WEIGHTS[mod.priority],
  }))

  // Step 2: Filter irrelevant (< 0.1), but keep critical
  const eligible = scored.filter(
    (s) => s.relevance >= 0.1 || s.module.priority === 'critical',
  )

  // Step 3: Sort by effective score descending
  eligible.sort((a, b) => b.effectiveScore - a.effectiveScore)

  // Step 4: Greedy allocation
  let remaining = totalBudget
  const allocations: ModuleAllocation[] = []

  for (const entry of eligible) {
    if (remaining <= 0) break

    const { module, relevance } = entry

    // Determine grant: at least minTokens, up to maxTokens, capped by remaining budget
    const desiredTokens = Math.min(module.maxTokens, remaining)

    if (desiredTokens < module.minTokens) {
      // Not enough budget left for even the minimum — skip unless critical
      if (module.priority === 'critical') {
        const grant = Math.min(module.minTokens, remaining)
        allocations.push({
          moduleName: module.name,
          tokenBudget: grant,
          relevance,
        })
        remaining -= grant
      }
      continue
    }

    const grant = Math.max(module.minTokens, desiredTokens)
    allocations.push({
      moduleName: module.name,
      tokenBudget: grant,
      relevance,
    })
    remaining -= grant
  }

  logger.debug('[global-workspace] Allocation complete', {
    query: query.slice(0, 50),
    totalBudget,
    allocated: totalBudget - remaining,
    moduleCount: allocations.length,
    modules: allocations.map((a) => `${a.moduleName}:${a.tokenBudget}`),
  })

  return allocations
}
