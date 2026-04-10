/**
 * Cost circuit breaker for browser automation tasks.
 *
 * Tracks token usage and session time against an LTV-scaled budget,
 * enforcing spend limits per browser task to prevent runaway costs.
 *
 * Base budget: $0.50 USD per task.
 * LTV multiplier: clamped to [0.1, 10.0].
 */

import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_BUDGET_USD = 0.50

/** Minimum LTV multiplier (floors at 10% of base) */
const MIN_LTV_MULTIPLIER = 0.1

/** Maximum LTV multiplier (caps at 10x base) */
const MAX_LTV_MULTIPLIER = 10.0

/**
 * Approximate cost per 1K input tokens (Claude 3.5 Sonnet pricing).
 * Used for rough budget estimation, not billing.
 */
const COST_PER_1K_TOKENS = 0.003

/**
 * Approximate cost per minute of browser session compute.
 * Covers Stagehand + browser instance overhead.
 */
const COST_PER_SESSION_MINUTE = 0.002

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostBudget {
  maxBudgetUsd: number
  spentUsd: number
  tokensUsed: number
  sessionMinutes: number
  ltvMultiplier: number
}

export interface BudgetCheck {
  withinBudget: boolean
  utilization: number
  remaining: number
  spentUsd: number
  maxBudgetUsd: number
}

export interface PreFlightBudgetResult {
  allowed: boolean
  maxBudgetUsd: number
  ltvMultiplier: number
}

// ---------------------------------------------------------------------------
// LTV clamping
// ---------------------------------------------------------------------------

function clampLtv(multiplier: number): number {
  return Math.max(MIN_LTV_MULTIPLIER, Math.min(MAX_LTV_MULTIPLIER, multiplier))
}

// ---------------------------------------------------------------------------
// Budget creation
// ---------------------------------------------------------------------------

/**
 * Create a cost budget for a browser task.
 *
 * @param ltvMultiplier - Scales the base budget (clamped to [0.1, 10.0])
 * @param baseBudgetOverride - Override the default $0.50 base budget
 */
export function createCostBudget(
  ltvMultiplier: number,
  baseBudgetOverride?: number,
): CostBudget {
  const clampedLtv = clampLtv(ltvMultiplier)
  const baseBudget = baseBudgetOverride ?? DEFAULT_BASE_BUDGET_USD
  const maxBudgetUsd = baseBudget * clampedLtv

  return {
    maxBudgetUsd,
    spentUsd: 0,
    tokensUsed: 0,
    sessionMinutes: 0,
    ltvMultiplier: clampedLtv,
  }
}

// ---------------------------------------------------------------------------
// Recording usage
// ---------------------------------------------------------------------------

/**
 * Record token usage and update the spent amount.
 */
export function recordTokens(budget: CostBudget, tokens: number): void {
  budget.tokensUsed += tokens
  budget.spentUsd += (tokens / 1000) * COST_PER_1K_TOKENS
}

/**
 * Record session compute time and update the spent amount.
 */
export function recordSessionTime(budget: CostBudget, minutes: number): void {
  budget.sessionMinutes += minutes
  budget.spentUsd += minutes * COST_PER_SESSION_MINUTE
}

// ---------------------------------------------------------------------------
// Budget checks
// ---------------------------------------------------------------------------

/**
 * Check whether the budget has been exceeded.
 */
export function checkBudget(budget: CostBudget): BudgetCheck {
  const utilization = budget.maxBudgetUsd > 0
    ? budget.spentUsd / budget.maxBudgetUsd
    : 1.0
  const remaining = Math.max(0, budget.maxBudgetUsd - budget.spentUsd)
  const withinBudget = budget.spentUsd < budget.maxBudgetUsd

  if (!withinBudget) {
    logger.warn('[cost-monitor] Budget exceeded', {
      spentUsd: budget.spentUsd.toFixed(4),
      maxBudgetUsd: budget.maxBudgetUsd.toFixed(4),
      tokensUsed: budget.tokensUsed,
      sessionMinutes: budget.sessionMinutes,
    })
  }

  return {
    withinBudget,
    utilization,
    remaining,
    spentUsd: budget.spentUsd,
    maxBudgetUsd: budget.maxBudgetUsd,
  }
}

/**
 * Pre-flight budget validation — confirms a budget can be created
 * and returns the maximum spend allowed for the task.
 */
export function preFlightBudgetCheck(
  ltvMultiplier: number,
  baseBudgetOverride?: number,
): PreFlightBudgetResult {
  const clampedLtv = clampLtv(ltvMultiplier)
  const baseBudget = baseBudgetOverride ?? DEFAULT_BASE_BUDGET_USD
  const maxBudgetUsd = baseBudget * clampedLtv

  return {
    allowed: true,
    maxBudgetUsd,
    ltvMultiplier: clampedLtv,
  }
}
