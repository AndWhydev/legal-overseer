import { describe, expect, it } from 'vitest'
import {
  VALID_TRANSITIONS,
  assertTransition,
  calculateRetryDelay,
  isTerminalStatus,
  isValidTransition,
} from '../fsm'

describe('FSM: VALID_TRANSITIONS', () => {
  it('pending allows claimed and cancelled', () => {
    expect(VALID_TRANSITIONS.pending.has('claimed')).toBe(true)
    expect(VALID_TRANSITIONS.pending.has('cancelled')).toBe(true)
    expect(VALID_TRANSITIONS.pending.size).toBe(2)
  })

  it('claimed allows working, failed, and cancelled', () => {
    expect(VALID_TRANSITIONS.claimed.has('working')).toBe(true)
    expect(VALID_TRANSITIONS.claimed.has('failed')).toBe(true)
    expect(VALID_TRANSITIONS.claimed.has('cancelled')).toBe(true)
    expect(VALID_TRANSITIONS.claimed.size).toBe(3)
  })

  it('working allows paused, completed, failed, and cancelled', () => {
    expect(VALID_TRANSITIONS.working.has('paused')).toBe(true)
    expect(VALID_TRANSITIONS.working.has('completed')).toBe(true)
    expect(VALID_TRANSITIONS.working.has('failed')).toBe(true)
    expect(VALID_TRANSITIONS.working.has('cancelled')).toBe(true)
    expect(VALID_TRANSITIONS.working.size).toBe(4)
  })

  it('paused allows working and cancelled', () => {
    expect(VALID_TRANSITIONS.paused.has('working')).toBe(true)
    expect(VALID_TRANSITIONS.paused.has('cancelled')).toBe(true)
    expect(VALID_TRANSITIONS.paused.size).toBe(2)
  })

  it('completed is terminal (no transitions)', () => {
    expect(VALID_TRANSITIONS.completed.size).toBe(0)
  })

  it('failed allows pending (retry)', () => {
    expect(VALID_TRANSITIONS.failed.has('pending')).toBe(true)
    expect(VALID_TRANSITIONS.failed.size).toBe(1)
  })

  it('cancelled is terminal (no transitions)', () => {
    expect(VALID_TRANSITIONS.cancelled.size).toBe(0)
  })
})

describe('isValidTransition', () => {
  it('returns true for valid transitions', () => {
    expect(isValidTransition('pending', 'claimed')).toBe(true)
    expect(isValidTransition('claimed', 'working')).toBe(true)
    expect(isValidTransition('working', 'completed')).toBe(true)
    expect(isValidTransition('working', 'failed')).toBe(true)
    expect(isValidTransition('failed', 'pending')).toBe(true)
    expect(isValidTransition('paused', 'working')).toBe(true)
  })

  it('returns false for invalid transitions', () => {
    expect(isValidTransition('completed', 'pending')).toBe(false)
    expect(isValidTransition('cancelled', 'pending')).toBe(false)
    expect(isValidTransition('pending', 'completed')).toBe(false)
    expect(isValidTransition('pending', 'working')).toBe(false)
    expect(isValidTransition('working', 'claimed')).toBe(false)
  })
})

describe('assertTransition', () => {
  it('does not throw for valid transitions', () => {
    expect(() => assertTransition('pending', 'claimed')).not.toThrow()
    expect(() => assertTransition('working', 'completed')).not.toThrow()
  })

  it('throws for invalid transitions', () => {
    expect(() => assertTransition('completed', 'pending')).toThrow(
      'Invalid task state transition: completed -> pending',
    )
    expect(() => assertTransition('cancelled', 'working')).toThrow(
      'Invalid task state transition: cancelled -> working',
    )
  })
})

describe('isTerminalStatus', () => {
  it('returns true for terminal statuses', () => {
    expect(isTerminalStatus('completed')).toBe(true)
    expect(isTerminalStatus('cancelled')).toBe(true)
  })

  it('returns false for non-terminal statuses', () => {
    expect(isTerminalStatus('pending')).toBe(false)
    expect(isTerminalStatus('claimed')).toBe(false)
    expect(isTerminalStatus('working')).toBe(false)
    expect(isTerminalStatus('paused')).toBe(false)
    expect(isTerminalStatus('failed')).toBe(false)
  })
})

describe('calculateRetryDelay', () => {
  it('returns base delay for fixed strategy', () => {
    const delay = calculateRetryDelay(0, 'fixed', 1000, 30000)
    expect(delay).toBe(1000)
  })

  it('caps fixed delay at maxDelayMs', () => {
    const delay = calculateRetryDelay(0, 'fixed', 50000, 30000)
    expect(delay).toBe(30000)
  })

  it('returns exponentially larger delays for exponential strategy', () => {
    const delay0 = calculateRetryDelay(0, 'exponential', 1000, 30000)
    const delay1 = calculateRetryDelay(1, 'exponential', 1000, 30000)
    const delay2 = calculateRetryDelay(2, 'exponential', 1000, 30000)
    // Each retry roughly doubles (ignoring jitter). Just check ordering.
    expect(delay1).toBeGreaterThan(delay0)
    expect(delay2).toBeGreaterThan(delay1)
  })

  it('caps exponential delay at maxDelayMs', () => {
    const delay = calculateRetryDelay(100, 'exponential', 1000, 30000)
    expect(delay).toBeLessThanOrEqual(30000)
  })
})
