/**
 * Cron Resilience Utilities
 *
 * Opt-in utilities for cron route handlers to handle:
 * - DB connection failures (retry with exponential backoff)
 * - Rate limits (detect 429 / "rate limit" and wait)
 * - Partial batch failures (continue processing, dead-letter failures)
 * - Circuit breaker awareness (skip items when circuit is open)
 *
 * Usage: Individual cron routes import processBatch to wrap their
 * item-level processing. withRetry and withBackoff are composable
 * building blocks used by processBatch or standalone.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCircuitState } from '@/lib/agent/circuit-breaker'
import { deadLetter } from '@/lib/agent/dead-letter'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Returns true if the error is a transient connection/timeout error
 * that should be retried. Non-transient errors (validation, auth, etc.)
 * are NOT retried.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('connection') ||
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset')
    )
  }
  return false
}

/**
 * Returns true if the error is a rate limit (HTTP 429 or message match).
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
      return true
    }
    // Check for status property on error (e.g. from HTTP clients)
    const status = (error as Record<string, unknown>).status
    if (status === 429) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of retry attempts (not counting initial). Default 3. */
  maxRetries: number
  /** Base delay in ms (doubles each retry). */
  baseDelayMs: number
  /** Label for logging. */
  label: string
}

/**
 * Retry an async function with exponential backoff.
 *
 * Only retries transient errors (connection, timeout). Non-retryable errors
 * are thrown immediately. After maxRetries, throws the last error.
 *
 * Delay = baseDelayMs * 2^attempt (0-indexed).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const { maxRetries, baseDelayMs, label } = opts
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      // Don't retry non-transient errors
      if (!isRetryableError(err)) {
        throw err
      }

      // Exhausted retries
      if (attempt >= maxRetries) {
        logger.error(`[cron-resilience] ${label}: exhausted ${maxRetries} retries`)
        throw err
      }

      const delay = baseDelayMs * Math.pow(2, attempt)
      logger.warn(`[cron-resilience] ${label}: retry ${attempt + 1}/${maxRetries} in ${delay}ms`)
      await sleep(delay)
    }
  }

  // Unreachable, satisfies TS
  throw lastError
}

// ---------------------------------------------------------------------------
// withBackoff
// ---------------------------------------------------------------------------

export interface BackoffOptions {
  /** Label for logging. */
  label: string
}

/**
 * Wrap an async function with rate limit detection.
 *
 * If the function throws a rate limit error (429 status or "rate limit"
 * in message), waits the Retry-After value (or 60s default) and retries
 * once. Non-rate-limit errors pass through immediately.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: BackoffOptions,
): Promise<T> {
  const { label } = opts

  try {
    return await fn()
  } catch (err) {
    if (!isRateLimitError(err)) {
      throw err
    }

    // Extract Retry-After if available, otherwise default 60s
    const retryAfterMs = 60_000
    logger.warn(`[cron-resilience] ${label}: rate limited, waiting ${retryAfterMs / 1000}s`)
    await sleep(retryAfterMs)

    // Retry once after backoff
    return await fn()
  }
}

// ---------------------------------------------------------------------------
// processBatch
// ---------------------------------------------------------------------------

export interface BatchOptions<T> {
  /** Label for logging and DLQ agent_type. */
  label: string
  /** Circuit breaker key to check before each item. */
  circuitKey?: string
  /** Supabase client for dead-lettering failures. */
  supabase?: SupabaseClient
  /** Org ID for dead-letter entries. */
  orgId?: string
}

export interface BatchResult<T, R> {
  results: R[]
  errors: { item: T; error: string }[]
}

/**
 * Process a batch of items sequentially with error isolation.
 *
 * - Each item is wrapped in try/catch -- one failure does not stop the batch.
 * - If circuitKey is provided, checks circuit state before each item.
 *   Skips remaining items if circuit is open.
 * - Failed items are dead-lettered when supabase + orgId are provided.
 * - Returns both successful results and error details.
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  opts: BatchOptions<T>,
): Promise<BatchResult<T, R>> {
  const { label, circuitKey, supabase, orgId } = opts
  const results: R[] = []
  const errors: { item: T; error: string }[] = []

  for (const item of items) {
    // Check circuit breaker before each item
    if (circuitKey) {
      const state = getCircuitState(circuitKey)
      if (state === 'open') {
        const msg = `circuit breaker open for ${circuitKey} -- skipping item`
        logger.warn(`[cron-resilience] ${label}: ${msg}`)
        errors.push({ item, error: msg })
        continue
      }
    }

    try {
      const result = await processor(item)
      results.push(result)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logger.error(`[cron-resilience] ${label}: item failed: ${errorMessage}`)
      errors.push({ item, error: errorMessage })

      // Dead-letter if we have supabase + orgId
      if (supabase && orgId) {
        await deadLetter(supabase, {
          agent_type: label,
          org_id: orgId,
          error_message: errorMessage,
          payload: { item },
        })
      }
    }
  }

  logger.info(
    `[cron-resilience] ${label}: batch complete -- ${results.length} succeeded, ${errors.length} failed`,
  )

  return { results, errors }
}
