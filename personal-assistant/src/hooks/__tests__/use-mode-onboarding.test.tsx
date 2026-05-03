/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useModeOnboarding } from '../use-mode-onboarding'

const USER = 'user-abc'

function storageKey(mode: string): string {
  return `bitbit-onboarding:${USER}:${mode}`
}

describe('useModeOnboarding', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
  })

  it('hydrates from localStorage on mount', () => {
    window.localStorage.setItem(storageKey('money'), JSON.stringify(['money-1-add-contact']))
    const { result } = renderHook(() => useModeOnboarding({ userId: USER, mode: 'money' }))
    expect(result.current.completedStepIds).toEqual(['money-1-add-contact'])
    expect(result.current.nextStep?.id).toBe('money-2-create-invoice-draft')
  })

  it('starts with empty completion state when nothing is stored', () => {
    const { result } = renderHook(() => useModeOnboarding({ userId: USER, mode: 'money' }))
    expect(result.current.completedStepIds).toEqual([])
    expect(result.current.nextStep?.id).toBe('money-1-add-contact')
    expect(result.current.progress).toEqual({ completed: 0, total: 3, percent: 0 })
  })

  it('completeStep marks a step done and advances nextStep', () => {
    const { result } = renderHook(() => useModeOnboarding({ userId: USER, mode: 'money' }))

    act(() => {
      result.current.completeStep('money-1-add-contact')
    })

    expect(result.current.completedStepIds).toContain('money-1-add-contact')
    expect(result.current.nextStep?.id).toBe('money-2-create-invoice-draft')
  })

  it('completeStep is idempotent — calling it twice for the same id does not duplicate', () => {
    const { result } = renderHook(() => useModeOnboarding({ userId: USER, mode: 'money' }))

    act(() => {
      result.current.completeStep('money-1-add-contact')
      result.current.completeStep('money-1-add-contact')
    })

    const matches = result.current.completedStepIds.filter(id => id === 'money-1-add-contact')
    expect(matches.length).toBe(1)
  })

  it('persists completed steps to localStorage after debounce', () => {
    const { result } = renderHook(() => useModeOnboarding({ userId: USER, mode: 'money' }))

    act(() => {
      result.current.completeStep('money-1-add-contact')
    })

    // Pre-debounce: nothing written yet (the empty SSR write was already
    // suppressed by the hydration gate).
    expect(window.localStorage.getItem(storageKey('money'))).toBeNull()

    act(() => {
      vi.advanceTimersByTime(250)
    })

    const stored = window.localStorage.getItem(storageKey('money'))
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toContain('money-1-add-contact')
  })

  it('isComplete reflects required-step completion', () => {
    const { result } = renderHook(() => useModeOnboarding({ userId: USER, mode: 'inbox' }))
    expect(result.current.isComplete).toBe(false)

    act(() => {
      result.current.completeStep('inbox-1-connect-channel')
    })

    expect(result.current.isComplete).toBe(true)
  })

  it('chat is complete out of the box (no required steps)', () => {
    const { result } = renderHook(() => useModeOnboarding({ userId: USER, mode: 'chat' }))
    expect(result.current.isComplete).toBe(true)
  })

  it('resetMode clears completed steps and removes the localStorage key', () => {
    window.localStorage.setItem(
      storageKey('inbox'),
      JSON.stringify(['inbox-1-connect-channel', 'inbox-2-send-test-message']),
    )
    const { result } = renderHook(() => useModeOnboarding({ userId: USER, mode: 'inbox' }))
    expect(result.current.completedStepIds.length).toBe(2)

    act(() => {
      result.current.resetMode()
    })

    expect(result.current.completedStepIds).toEqual([])
    expect(window.localStorage.getItem(storageKey('inbox'))).toBeNull()
  })

  it('drops corrupt entries (non-string values in the stored array)', () => {
    window.localStorage.setItem(
      storageKey('money'),
      JSON.stringify(['money-1-add-contact', 42, null, { id: 'oops' }]),
    )
    const { result } = renderHook(() => useModeOnboarding({ userId: USER, mode: 'money' }))
    expect(result.current.completedStepIds).toEqual(['money-1-add-contact'])
  })

  it('returns empty completion when stored value is corrupt JSON', () => {
    window.localStorage.setItem(storageKey('money'), '{not json')
    const { result } = renderHook(() => useModeOnboarding({ userId: USER, mode: 'money' }))
    expect(result.current.completedStepIds).toEqual([])
  })

  it('re-hydrates when (userId, mode) changes', () => {
    window.localStorage.setItem(storageKey('inbox'), JSON.stringify(['inbox-1-connect-channel']))
    window.localStorage.setItem(storageKey('money'), JSON.stringify(['money-1-add-contact']))

    const { result, rerender } = renderHook(
      ({ mode }: { mode: 'inbox' | 'money' }) =>
        useModeOnboarding({ userId: USER, mode }),
      { initialProps: { mode: 'inbox' } },
    )

    expect(result.current.completedStepIds).toEqual(['inbox-1-connect-channel'])

    rerender({ mode: 'money' })

    expect(result.current.completedStepIds).toEqual(['money-1-add-contact'])
  })
})
