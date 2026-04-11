/**
 * Rate limiting module for BitBit
 *
 * Prevents runaway agent behavior through action-specific rate limits.
 * Uses token bucket algorithm via rate-limiter-flexible.
 */

import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

/**
 * Risk levels for rate limiting (matches audit.ts)
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Rate limit configuration per risk level
 *
 * Critical: Payment approvals, deletions, irreversible actions
 * High: External API calls, bulk operations
 * Medium: Internal state changes
 * Low: Read operations, drafts, logs
 */
const RATE_LIMITS: Record<RiskLevel, { points: number; duration: number }> = {
  critical: { points: 5, duration: 3600 }, // 5 per hour
  high: { points: 20, duration: 3600 }, // 20 per hour
  medium: { points: 100, duration: 3600 }, // 100 per hour
  low: { points: 1000, duration: 3600 }, // 1000 per hour
};

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Points remaining before limit */
  remainingPoints: number;
  /** Milliseconds before next point available */
  msBeforeNext: number;
}

/**
 * Rate limiters per risk level
 */
const limiters = new Map<RiskLevel, RateLimiterMemory>();

// Initialize limiters
for (const [level, config] of Object.entries(RATE_LIMITS)) {
  limiters.set(level as RiskLevel, new RateLimiterMemory(config));
}

/**
 * Check rate limit and consume a point if allowed
 *
 * @param key - Rate limit key (typically agentId or agentId:actionType)
 * @param riskLevel - Risk level of the action
 * @returns Rate limit result with allowed status and remaining points
 */
export async function checkRateLimit(
  key: string,
  riskLevel: RiskLevel
): Promise<RateLimitResult> {
  const limiter = limiters.get(riskLevel);
  if (!limiter) {
    throw new Error(`Unknown risk level: ${riskLevel}`);
  }

  try {
    const res = await limiter.consume(key);
    return {
      allowed: true,
      remainingPoints: res.remainingPoints,
      msBeforeNext: res.msBeforeNext,
    };
  } catch (rejRes) {
    // Rate limit exceeded
    const res = rejRes as RateLimiterRes;
    return {
      allowed: false,
      remainingPoints: res.remainingPoints,
      msBeforeNext: res.msBeforeNext,
    };
  }
}

/**
 * Get rate limit status without consuming a point
 *
 * @param key - Rate limit key
 * @param riskLevel - Risk level of the action
 * @returns Current rate limit status
 */
export async function getRateLimitStatus(
  key: string,
  riskLevel: RiskLevel
): Promise<RateLimitResult> {
  const limiter = limiters.get(riskLevel);
  if (!limiter) {
    throw new Error(`Unknown risk level: ${riskLevel}`);
  }

  try {
    const res = await limiter.get(key);
    if (!res) {
      // No consumption yet - full points available
      return {
        allowed: true,
        remainingPoints: RATE_LIMITS[riskLevel].points,
        msBeforeNext: 0,
      };
    }
    return {
      allowed: res.remainingPoints > 0,
      remainingPoints: res.remainingPoints,
      msBeforeNext: res.msBeforeNext,
    };
  } catch {
    // Error getting status - assume allowed
    return {
      allowed: true,
      remainingPoints: RATE_LIMITS[riskLevel].points,
      msBeforeNext: 0,
    };
  }
}

/**
 * Reset rate limit for a key (for testing/admin purposes)
 *
 * @param key - Rate limit key
 * @param riskLevel - Risk level
 */
export async function resetRateLimit(
  key: string,
  riskLevel: RiskLevel
): Promise<void> {
  const limiter = limiters.get(riskLevel);
  if (!limiter) {
    throw new Error(`Unknown risk level: ${riskLevel}`);
  }

  await limiter.delete(key);
}

/**
 * Get rate limit configuration
 *
 * @param riskLevel - Risk level
 * @returns Configuration for the risk level
 */
export function getRateLimitConfig(
  riskLevel: RiskLevel
): { points: number; duration: number } {
  return RATE_LIMITS[riskLevel];
}
