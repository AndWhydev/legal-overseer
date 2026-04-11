import type { TaskStatus } from './types'

/**
 * Valid state transitions for the 7-state execution task FSM.
 * Key = current state, Value = set of allowed next states.
 */
export const VALID_TRANSITIONS: Record<TaskStatus, Set<TaskStatus>> = {
  pending:   new Set(['claimed', 'cancelled']),
  claimed:   new Set(['working', 'failed', 'cancelled']),
  working:   new Set(['paused', 'completed', 'failed', 'cancelled']),
  paused:    new Set(['working', 'cancelled']),
  completed: new Set(), // terminal
  failed:    new Set(['pending']), // retry transitions back to pending
  cancelled: new Set(), // terminal
}

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TRANSITIONS[from]?.has(to) ?? false
}

/**
 * Assert a transition is valid, throwing if not.
 */
export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid task state transition: ${from} -> ${to}`)
  }
}

/**
 * Check if a status is terminal (no further transitions allowed).
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return VALID_TRANSITIONS[status]?.size === 0
}

/**
 * Calculate retry delay using the task's retry policy.
 */
export function calculateRetryDelay(
  retryCount: number,
  strategy: 'exponential' | 'fixed',
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  if (strategy === 'fixed') return Math.min(baseDelayMs, maxDelayMs)
  // Exponential backoff with jitter
  const exponentialDelay = baseDelayMs * Math.pow(2, retryCount)
  const jitter = Math.random() * baseDelayMs * 0.5
  return Math.min(exponentialDelay + jitter, maxDelayMs)
}
