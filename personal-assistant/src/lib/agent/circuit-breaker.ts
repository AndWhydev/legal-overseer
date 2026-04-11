/**
 * Circuit breaker for LLM / external API calls.
 *
 * States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (probing).
 * Tracks consecutive failures per key. Opens after `threshold` failures,
 * retries after `cooldownMs` in half-open state.
 */

export type CircuitState = 'closed' | 'open' | 'half_open'

export interface CircuitBreakerOptions {
  /** Consecutive failures before opening. Default 5. */
  threshold?: number
  /** Milliseconds to wait before half-open probe. Default 60_000. */
  cooldownMs?: number
}

interface CircuitEntry {
  state: CircuitState
  failures: number
  lastFailureAt: number
}

const DEFAULT_THRESHOLD = 5
const DEFAULT_COOLDOWN_MS = 60_000

// In-memory per-key circuit state (resets on cold start -- acceptable for serverless)
const circuits = new Map<string, CircuitEntry>()

function getEntry(key: string): CircuitEntry {
  let entry = circuits.get(key)
  if (!entry) {
    entry = { state: 'closed', failures: 0, lastFailureAt: 0 }
    circuits.set(key, entry)
  }
  return entry
}

/**
 * Returns current state for a circuit key, transitioning OPEN -> HALF_OPEN
 * when cooldown has elapsed.
 */
export function getCircuitState(
  key: string,
  opts?: CircuitBreakerOptions,
): CircuitState {
  const entry = getEntry(key)
  const cooldownMs = opts?.cooldownMs ?? DEFAULT_COOLDOWN_MS

  if (entry.state === 'open' && Date.now() - entry.lastFailureAt >= cooldownMs) {
    entry.state = 'half_open'
  }

  return entry.state
}

/**
 * Record a successful call -- resets the circuit to CLOSED.
 */
export function recordSuccess(key: string): void {
  const entry = getEntry(key)
  entry.state = 'closed'
  entry.failures = 0
}

/**
 * Record a failed call. Opens circuit after threshold consecutive failures.
 */
export function recordFailure(
  key: string,
  opts?: CircuitBreakerOptions,
): CircuitState {
  const entry = getEntry(key)
  const threshold = opts?.threshold ?? DEFAULT_THRESHOLD

  entry.failures += 1
  entry.lastFailureAt = Date.now()

  if (entry.failures >= threshold) {
    entry.state = 'open'
  }

  return entry.state
}

/**
 * Wrap an async function with circuit breaker protection.
 * Throws if circuit is OPEN. On HALF_OPEN allows one probe call.
 */
export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  opts?: CircuitBreakerOptions,
): Promise<T> {
  const state = getCircuitState(key, opts)

  if (state === 'open') {
    throw new CircuitOpenError(key)
  }

  try {
    const result = await fn()
    recordSuccess(key)
    return result
  } catch (err) {
    recordFailure(key, opts)
    throw err
  }
}

export class CircuitOpenError extends Error {
  constructor(public readonly circuitKey: string) {
    super(`Circuit breaker OPEN for "${circuitKey}"`)
    this.name = 'CircuitOpenError'
  }
}

/**
 * Reset a circuit (useful for tests).
 */
export function resetCircuit(key: string): void {
  circuits.delete(key)
}

/**
 * Reset all circuits (useful for tests).
 */
export function resetAllCircuits(): void {
  circuits.clear()
}
