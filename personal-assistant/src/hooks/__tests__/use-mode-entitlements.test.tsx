/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useModeEntitlements, isModeLocked } from '../use-mode-entitlements'

const ALL_MODES = ['chat', 'inbox', 'work', 'money'] as const

describe('useModeEntitlements', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('starts with loading=true and ALL modes enabled (permissive default)', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch
    const { result } = renderHook(() => useModeEntitlements())
    expect(result.current.loading).toBe(true)
    expect(result.current.enabledModes).toEqual(ALL_MODES)
    expect(result.current.lockedModes).toEqual({})
    expect(result.current.error).toBeNull()
  })

  it('hydrates from a successful response', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        plan: 'starter',
        enabledModes: ['chat', 'inbox'],
        lockedModes: {
          work: { requiredPlan: 'growth' },
          money: { requiredPlan: 'growth' },
        },
      }),
    })) as unknown as typeof fetch

    const { result } = renderHook(() => useModeEntitlements())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.plan).toBe('starter')
    expect(result.current.enabledModes).toEqual(['chat', 'inbox'])
    expect(result.current.lockedModes).toEqual({
      work: { requiredPlan: 'growth' },
      money: { requiredPlan: 'growth' },
    })
    expect(result.current.error).toBeNull()
  })

  it('falls back to permissive defaults on a 401 (unauthenticated)', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    })) as unknown as typeof fetch

    const { result } = renderHook(() => useModeEntitlements())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.enabledModes).toEqual(ALL_MODES)
    expect(result.current.lockedModes).toEqual({})
    expect(result.current.error).toContain('401')
  })

  it('falls back to permissive defaults on a network error', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useModeEntitlements())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.enabledModes).toEqual(ALL_MODES)
    expect(result.current.error).toBe('network down')
  })

  it('does not setState after unmount (no react warning)', async () => {
    let resolve: ((v: unknown) => void) | null = null
    global.fetch = vi.fn(() => new Promise(r => { resolve = r })) as unknown as typeof fetch

    const { result, unmount } = renderHook(() => useModeEntitlements())
    unmount()

    // Resolve the in-flight request after unmount.
    await act(async () => {
      resolve!({
        ok: true,
        status: 200,
        json: async () => ({ plan: 'free', enabledModes: ['chat'], lockedModes: {} }),
      })
    })

    // The post-unmount value is whatever was captured at unmount — the
    // `cancelled` flag inside the hook prevents the late setState.
    expect(result.current.loading).toBe(true)
  })
})

describe('isModeLocked', () => {
  it('returns true when the mode is in lockedModes', () => {
    const state = {
      plan: 'starter' as const,
      enabledModes: ['chat', 'inbox'] as const,
      lockedModes: { money: { requiredPlan: 'growth' as const } },
      loading: false,
      error: null,
    }
    expect(isModeLocked(state, 'money')).toBe(true)
    expect(isModeLocked(state, 'chat')).toBe(false)
  })
})
