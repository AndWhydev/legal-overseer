import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCircuitState,
  recordSuccess,
  recordFailure,
  withCircuitBreaker,
  CircuitOpenError,
  resetCircuit,
  resetAllCircuits,
  type CircuitBreakerOptions,
} from './circuit-breaker'

describe('circuit-breaker', () => {
  beforeEach(() => {
    resetAllCircuits()
  })

  describe('getCircuitState', () => {
    it('returns closed for a new circuit', () => {
      const state = getCircuitState('test-key')
      expect(state).toBe('closed')
    })

    it('transitions from open to half_open after cooldown', () => {
      const key = 'test-key'
      const cooldownMs = 100

      // Record failures to open the circuit
      recordFailure(key, { threshold: 1, cooldownMs })
      expect(getCircuitState(key, { cooldownMs })).toBe('open')

      // Before cooldown, still open
      expect(getCircuitState(key, { cooldownMs })).toBe('open')

      // After cooldown, transitions to half_open
      vi.useFakeTimers()
      vi.setSystemTime(Date.now() + cooldownMs + 1)
      expect(getCircuitState(key, { cooldownMs })).toBe('half_open')
      vi.useRealTimers()
    })

    it('uses default cooldown of 60_000ms', () => {
      const key = 'test-key'
      recordFailure(key, { threshold: 1 })
      expect(getCircuitState(key)).toBe('open')

      vi.useFakeTimers()
      vi.setSystemTime(Date.now() + 60_001)
      expect(getCircuitState(key)).toBe('half_open')
      vi.useRealTimers()
    })
  })

  describe('recordSuccess', () => {
    it('resets circuit to closed and clears failures', () => {
      const key = 'test-key'
      recordFailure(key, { threshold: 10 })
      recordFailure(key, { threshold: 10 })

      recordSuccess(key)

      expect(getCircuitState(key)).toBe('closed')
    })

    it('can recover from open state', () => {
      const key = 'test-key'
      recordFailure(key, { threshold: 1 })
      expect(getCircuitState(key)).toBe('open')

      recordSuccess(key)
      expect(getCircuitState(key)).toBe('closed')
    })

    it('resets failure count to zero', () => {
      const key = 'test-key'
      recordFailure(key)
      recordFailure(key)
      recordFailure(key)
      recordSuccess(key)

      // After reset, failures start at 0 again
      // Need 5 failures with default threshold to open
      recordFailure(key)
      recordFailure(key)
      recordFailure(key)
      recordFailure(key)
      expect(getCircuitState(key)).toBe('closed')

      recordFailure(key)
      expect(getCircuitState(key)).toBe('open')
    })
  })

  describe('recordFailure', () => {
    it('increments failure count', () => {
      const key = 'test-key'
      recordFailure(key)
      recordFailure(key)

      // After 2 failures with threshold 5, should still be closed
      expect(getCircuitState(key)).toBe('closed')
    })

    it('opens circuit after threshold failures', () => {
      const key = 'test-key'
      const threshold = 3

      recordFailure(key, { threshold })
      recordFailure(key, { threshold })
      expect(getCircuitState(key)).toBe('closed')

      recordFailure(key, { threshold })
      expect(getCircuitState(key)).toBe('open')
    })

    it('uses default threshold of 5', () => {
      const key = 'test-key'

      for (let i = 0; i < 4; i++) {
        recordFailure(key)
        expect(getCircuitState(key)).toBe('closed')
      }

      recordFailure(key)
      expect(getCircuitState(key)).toBe('open')
    })

    it('returns the new circuit state', () => {
      const key = 'test-key'

      const state1 = recordFailure(key, { threshold: 1 })
      expect(state1).toBe('open')

      const key2 = 'test-key-2'
      const state2 = recordFailure(key2, { threshold: 3 })
      expect(state2).toBe('closed')
    })

    it('updates lastFailureAt timestamp', () => {
      const key = 'test-key'
      vi.useFakeTimers()
      const now = new Date('2026-01-15T10:00:00Z').getTime()
      vi.setSystemTime(now)

      recordFailure(key, { threshold: 1 })

      vi.setSystemTime(now + 60_001)
      const state = getCircuitState(key, { cooldownMs: 60_000 })
      expect(state).toBe('half_open')

      vi.useRealTimers()
    })
  })

  describe('withCircuitBreaker', () => {
    it('executes function when circuit is closed', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const key = 'test-key'

      const result = await withCircuitBreaker(key, fn)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledOnce()
    })

    it('throws CircuitOpenError when circuit is open', async () => {
      const key = 'test-key'
      recordFailure(key, { threshold: 1 })

      const fn = vi.fn().mockResolvedValue('success')

      await expect(withCircuitBreaker(key, fn)).rejects.toThrow(CircuitOpenError)
      expect(fn).not.toHaveBeenCalled()
    })

    it('records success and resets failures on success', async () => {
      const key = 'test-key'
      recordFailure(key)
      recordFailure(key)

      const fn = vi.fn().mockResolvedValue('ok')

      await withCircuitBreaker(key, fn)

      expect(getCircuitState(key)).toBe('closed')
    })

    it('records failure and may open circuit on error', async () => {
      const key = 'test-key'
      const fn = vi.fn().mockRejectedValue(new Error('api down'))

      await expect(withCircuitBreaker(key, fn, { threshold: 2 })).rejects.toThrow('api down')

      recordFailure(key, { threshold: 2 })
      expect(getCircuitState(key)).toBe('open')
    })

    it('allows probe on half_open state', async () => {
      const key = 'test-key'
      const cooldownMs = 100

      recordFailure(key, { threshold: 1, cooldownMs })
      expect(getCircuitState(key, { cooldownMs })).toBe('open')

      vi.useFakeTimers()
      vi.setSystemTime(Date.now() + cooldownMs + 1)

      const fn = vi.fn().mockResolvedValue('recovered')
      const result = await withCircuitBreaker(key, fn, { threshold: 1, cooldownMs })

      expect(result).toBe('recovered')
      expect(getCircuitState(key)).toBe('closed')

      vi.useRealTimers()
    })

    it('rethrows original error after recording failure', async () => {
      const key = 'test-key'
      const error = new Error('upstream timeout')
      const fn = vi.fn().mockRejectedValue(error)

      await expect(withCircuitBreaker(key, fn)).rejects.toThrow('upstream timeout')
    })

    it('accumulates failures across multiple calls', async () => {
      const key = 'test-key'
      const threshold = 3

      for (let i = 0; i < 2; i++) {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        try {
          await withCircuitBreaker(key, fn, { threshold })
        } catch {
          // Expected
        }
      }

      expect(getCircuitState(key)).toBe('closed')

      const fn = vi.fn().mockRejectedValue(new Error('fail'))
      await expect(withCircuitBreaker(key, fn, { threshold })).rejects.toThrow()

      expect(getCircuitState(key)).toBe('open')
    })
  })

  describe('CircuitOpenError', () => {
    it('has correct name and message', () => {
      const error = new CircuitOpenError('payment-api')

      expect(error.name).toBe('CircuitOpenError')
      expect(error.message).toBe('Circuit breaker OPEN for "payment-api"')
    })

    it('stores circuitKey property', () => {
      const error = new CircuitOpenError('webhook-processor')

      expect(error.circuitKey).toBe('webhook-processor')
    })

    it('is instanceof Error', () => {
      const error = new CircuitOpenError('test')

      expect(error instanceof Error).toBe(true)
    })
  })

  describe('resetCircuit', () => {
    it('resets a specific circuit', () => {
      const key1 = 'circuit-1'
      const key2 = 'circuit-2'

      recordFailure(key1, { threshold: 1 })
      recordFailure(key2, { threshold: 1 })

      expect(getCircuitState(key1)).toBe('open')
      expect(getCircuitState(key2)).toBe('open')

      resetCircuit(key1)

      expect(getCircuitState(key1)).toBe('closed')
      expect(getCircuitState(key2)).toBe('open')
    })

    it('allows circuit to be used normally after reset', async () => {
      const key = 'test-key'
      recordFailure(key, { threshold: 1 })

      resetCircuit(key)

      const fn = vi.fn().mockResolvedValue('ok')
      const result = await withCircuitBreaker(key, fn)

      expect(result).toBe('ok')
      expect(getCircuitState(key)).toBe('closed')
    })
  })

  describe('resetAllCircuits', () => {
    it('resets all circuits', () => {
      recordFailure('circuit-1', { threshold: 1 })
      recordFailure('circuit-2', { threshold: 1 })
      recordFailure('circuit-3', { threshold: 1 })

      expect(getCircuitState('circuit-1')).toBe('open')
      expect(getCircuitState('circuit-2')).toBe('open')
      expect(getCircuitState('circuit-3')).toBe('open')

      resetAllCircuits()

      expect(getCircuitState('circuit-1')).toBe('closed')
      expect(getCircuitState('circuit-2')).toBe('closed')
      expect(getCircuitState('circuit-3')).toBe('closed')
    })
  })

  describe('independent circuits', () => {
    it('maintains separate state per key', () => {
      const key1 = 'api-1'
      const key2 = 'api-2'

      recordFailure(key1, { threshold: 2 })
      recordFailure(key1, { threshold: 2 })
      expect(getCircuitState(key1)).toBe('open')

      expect(getCircuitState(key2)).toBe('closed')

      recordFailure(key2, { threshold: 2 })
      expect(getCircuitState(key2)).toBe('closed')
    })

    it('success on one circuit does not affect another', () => {
      const key1 = 'api-1'
      const key2 = 'api-2'

      recordFailure(key1, { threshold: 2 })
      recordFailure(key2, { threshold: 2 })

      recordSuccess(key1)

      expect(getCircuitState(key1)).toBe('closed')
      expect(getCircuitState(key2)).toBe('closed')
    })
  })

  describe('state transitions', () => {
    it('transitions: closed -> open -> half_open -> closed', async () => {
      const key = 'lifecycle'
      const cooldownMs = 100
      const threshold = 1

      // Start: closed
      expect(getCircuitState(key)).toBe('closed')

      // closed -> open
      recordFailure(key, { threshold, cooldownMs })
      expect(getCircuitState(key)).toBe('open')

      // open -> half_open (after cooldown)
      vi.useFakeTimers()
      vi.setSystemTime(Date.now() + cooldownMs + 1)
      expect(getCircuitState(key, { cooldownMs })).toBe('half_open')

      // half_open -> closed (success)
      const fn = vi.fn().mockResolvedValue('ok')
      await withCircuitBreaker(key, fn, { threshold, cooldownMs })

      expect(getCircuitState(key)).toBe('closed')
      vi.useRealTimers()
    })

    it('can reopen circuit from half_open on failure', async () => {
      const key = 'reopen'
      const cooldownMs = 100
      const threshold = 1

      recordFailure(key, { threshold, cooldownMs })

      vi.useFakeTimers()
      vi.setSystemTime(Date.now() + cooldownMs + 1)
      expect(getCircuitState(key, { cooldownMs })).toBe('half_open')

      const fn = vi.fn().mockRejectedValue(new Error('still down'))
      await expect(withCircuitBreaker(key, fn, { threshold, cooldownMs })).rejects.toThrow()

      expect(getCircuitState(key)).toBe('open')
      vi.useRealTimers()
    })
  })
})
