/**
 * Model selection module for BitBit
 *
 * Provides model tiering logic for cost-effective task execution.
 * Routes tasks to Haiku/Sonnet/Opus based on complexity and risk level.
 *
 * Cost optimization strategy:
 * - Simple tasks → Haiku (~$0.25/1M tokens)
 * - Standard tasks → Sonnet (~$3.00/1M tokens)
 * - Complex tasks → Opus (~$15.00/1M tokens)
 * - Critical risk → Always Opus (safety override)
 */

/**
 * Model identifiers for Claude models
 *
 * Maps tier names to SDK model identifiers.
 */
export const MODELS = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const;

/**
 * Model tier type derived from MODELS keys
 */
export type ModelTier = keyof typeof MODELS;

/**
 * Approximate costs per 1M tokens (input + output averaged)
 *
 * Used for cost estimation and budget tracking.
 * Values are approximate and may change with Anthropic pricing updates.
 */
export const MODEL_COSTS = {
  haiku: 0.25,
  sonnet: 3.0,
  opus: 15.0,
} as const;

/**
 * Task complexity levels for model selection
 */
export type Complexity = 'simple' | 'standard' | 'complex';

/**
 * Risk levels that influence model selection
 *
 * - low: Standard operations, no special handling
 * - medium: Operations with moderate impact
 * - high: Operations that upgrade complexity by one tier
 * - critical: Always routes to Opus regardless of complexity
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Result of model selection
 */
export interface ModelSelection {
  /** SDK model identifier */
  model: string;
  /** Model tier name */
  tier: ModelTier;
  /** Reason for this selection (for audit logging) */
  reason: string;
}

/**
 * Select the appropriate model based on task complexity and risk level
 *
 * Implements the Plan-and-Execute pattern's model tiering:
 * - Classification uses Haiku (done separately in coordinator)
 * - Execution uses model selected here based on complexity
 *
 * Risk level modifies selection:
 * - Critical: Always Opus (safety override)
 * - High: Upgrades complexity by one tier
 * - Medium/Low: No modification
 *
 * @param complexity - Task complexity from classification
 * @param riskLevel - Risk level from task or default 'low'
 * @returns ModelSelection with model, tier, and reason
 */
export function selectModel(
  complexity: Complexity,
  riskLevel: RiskLevel = 'low'
): ModelSelection {
  // Critical risk always gets Opus (safety override)
  if (riskLevel === 'critical') {
    return {
      model: MODELS.opus,
      tier: 'opus',
      reason: 'Critical risk level requires maximum reasoning capability',
    };
  }

  // High risk upgrades complexity by one tier
  let effectiveComplexity = complexity;
  if (riskLevel === 'high') {
    if (complexity === 'simple') {
      effectiveComplexity = 'standard';
    } else if (complexity === 'standard') {
      effectiveComplexity = 'complex';
    }
    // 'complex' stays 'complex'
  }

  switch (effectiveComplexity) {
    case 'simple':
      return {
        model: MODELS.haiku,
        tier: 'haiku',
        reason: 'Simple task - cost-effective routing',
      };
    case 'standard':
      return {
        model: MODELS.sonnet,
        tier: 'sonnet',
        reason: 'Standard complexity - balanced capability/cost',
      };
    case 'complex':
      return {
        model: MODELS.opus,
        tier: 'opus',
        reason: 'Complex task - maximum reasoning capability',
      };
  }
}

/**
 * Estimate the cost of a task execution
 *
 * Provides a rough cost estimate based on model tier and expected tokens.
 * Useful for budget tracking and cost alerting.
 *
 * @param tier - Model tier to use
 * @param estimatedTokens - Estimated total tokens (input + output)
 * @returns Estimated cost in USD
 */
export function estimateCost(tier: ModelTier, estimatedTokens: number): number {
  return (estimatedTokens / 1_000_000) * MODEL_COSTS[tier];
}

/**
 * Get the model identifier for a given tier
 *
 * @param tier - Model tier name
 * @returns SDK model identifier string
 */
export function getModelId(tier: ModelTier): string {
  return MODELS[tier];
}
