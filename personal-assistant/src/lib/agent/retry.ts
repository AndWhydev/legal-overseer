/**
 * Retry with exponential backoff and jitter.
 *
 * For transient Supabase / API failures. Configurable max retries,
 * base delay, max delay, and jitter factor.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts. Default 3. */
  maxRetries?: number
  /** Base delay in ms before first retry. Default 500. */
  baseDelayMs?: number
  /** Maximum delay cap in ms. Default 30_000. */
  maxDelayMs?: number
  /** Jitter factor 0-1. Default 0.3. */
  jitter?: number
  /** Optional predicate: return true if the error is retryable. Default: all errors. */
  isRetryable?: (error: unknown) => boolean
}

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BASE_DELAY_MS = 500
const DEFAULT_MAX_DELAY_MS = 30_000
const DEFAULT_JITTER = 0.3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function computeDelay(attempt: number, opts: Required<Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs' | 'jitter'>>): number {
  const exponential = opts.baseDelayMs * Math.pow(2, attempt)
  const capped = Math.min(exponential, opts.maxDelayMs)
  const jitterAmount = capped * opts.jitter * Math.random()
  return capped + jitterAmount
}

/**
 * Execute `fn` with retries on failure.
 * Throws the last error if all retries are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES
  const baseDelayMs = opts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const maxDelayMs = opts?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const jitter = opts?.jitter ?? DEFAULT_JITTER
  const isRetryable = opts?.isRetryable ?? (() => true)

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      if (attempt >= maxRetries || !isRetryable(err)) {
        throw err
      }

      const delay = computeDelay(attempt, { baseDelayMs, maxDelayMs, jitter })
      await sleep(delay)
    }
  }

  // Unreachable, but satisfies TS
  throw lastError
}

/**
 * Predicate: returns true for common transient HTTP/network errors.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnrefused')) {
      return true
    }
    if (msg.includes('rate limit') || msg.includes('429') || msg.includes('503') || msg.includes('502')) {
      return true
    }
  }
  return false
}
