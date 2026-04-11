import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { canUse, recordUse, getRemainingQuota, resetAll } from '../rate-limiter'

describe('web rate-limiter', () => {
  beforeEach(() => {
    resetAll()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows use when under default limit', () => {
    expect(canUse('tavily')).toBe(true)
  })

  it('tracks usage and decrements quota', () => {
    const before = getRemainingQuota('tavily')
    recordUse('tavily')
    expect(getRemainingQuota('tavily')).toBe(before - 1)
  })

  it('blocks when quota exhausted', () => {
    vi.stubEnv('TAVILY_DAILY_LIMIT', '2')
    resetAll()
    recordUse('tavily')
    recordUse('tavily')
    expect(canUse('tavily')).toBe(false)
    expect(getRemainingQuota('tavily')).toBe(0)
  })

  it('respects per-provider env var limits', () => {
    vi.stubEnv('SERPER_DAILY_LIMIT', '3')
    resetAll()
    expect(getRemainingQuota('serper')).toBe(3)
  })

  it('uses default limits when env vars not set', () => {
    resetAll()
    expect(getRemainingQuota('tavily')).toBe(50)
    expect(getRemainingQuota('serper')).toBe(50)
    expect(getRemainingQuota('exa')).toBe(30)
  })

  it('returns true for unknown providers (no limit)', () => {
    expect(canUse('jina')).toBe(true)
    expect(canUse('markdown-new')).toBe(true)
  })

  it('resets all counters', () => {
    recordUse('tavily')
    recordUse('serper')
    resetAll()
    expect(getRemainingQuota('tavily')).toBe(50)
    expect(getRemainingQuota('serper')).toBe(50)
  })
})
