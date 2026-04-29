/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useModeDraft } from '../use-mode-draft'
import { loadDraft, saveDraft, _clearAllDraftsForUser } from '@/lib/dashboard/draft-store'
import type { Mode } from '@/lib/dashboard/mode-store'

const USER = 'user-abc'

describe('useModeDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
  })

  it('calls onLoad with an existing draft on mount', () => {
    saveDraft({ userId: USER, mode: 'inbox', draftType: 'reply' }, 'preserved')
    const onLoad = vi.fn()
    renderHook(() =>
      useModeDraft<string>({
        userId: USER, mode: 'inbox', draftType: 'reply',
        value: '', onLoad,
      }),
    )
    expect(onLoad).toHaveBeenCalledOnce()
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ value: 'preserved' }))
  })

  it('does not call onLoad when no draft exists', () => {
    const onLoad = vi.fn()
    renderHook(() =>
      useModeDraft<string>({
        userId: USER, mode: 'inbox', draftType: 'reply',
        value: '', onLoad,
      }),
    )
    expect(onLoad).not.toHaveBeenCalled()
  })

  it('debounces the save and writes after the window elapses', () => {
    const { rerender } = renderHook(
      ({ value }: { value: string }) =>
        useModeDraft<string>({
          userId: USER, mode: 'inbox', draftType: 'reply',
          value, debounceMs: 200,
        }),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'partial' })
    // Within the debounce window, nothing should be persisted yet.
    expect(loadDraft({ userId: USER, mode: 'inbox', draftType: 'reply' })).toBeNull()
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(loadDraft<string>({ userId: USER, mode: 'inbox', draftType: 'reply' })?.value).toBe('partial')
  })

  it('coalesces rapid value changes into a single save', () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    const { rerender } = renderHook(
      ({ value }: { value: string }) =>
        useModeDraft<string>({
          userId: USER, mode: 'inbox', draftType: 'reply',
          value, debounceMs: 100,
        }),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'a' })
    rerender({ value: 'ab' })
    rerender({ value: 'abc' })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    // Mount value is intentionally not persisted; only the final coalesced
    // value 'abc' should land in storage.
    const draftWrites = setSpy.mock.calls.filter(c => String(c[0]).startsWith('bitbit-draft:'))
    expect(draftWrites.length).toBe(1)
    expect(loadDraft<string>({ userId: USER, mode: 'inbox', draftType: 'reply' })?.value).toBe('abc')
  })

  it('does not persist the mount-time value when it has not changed (no clobber of loaded draft)', () => {
    saveDraft({ userId: USER, mode: 'inbox', draftType: 'reply' }, 'preserved')
    // Mount with empty value and NO onLoad — caller doesn't apply the load.
    renderHook(() =>
      useModeDraft<string>({
        userId: USER, mode: 'inbox', draftType: 'reply',
        value: '', debounceMs: 50,
      }),
    )
    act(() => vi.advanceTimersByTime(200))
    // The previously saved draft must NOT be wiped by the empty mount value.
    expect(loadDraft<string>({ userId: USER, mode: 'inbox', draftType: 'reply' })?.value).toBe('preserved')
  })

  it('clear() wipes the persisted draft', () => {
    saveDraft({ userId: USER, mode: 'work', draftType: 'task' }, { title: 't' })
    const { result } = renderHook(() =>
      useModeDraft<{ title: string }>({
        userId: USER, mode: 'work', draftType: 'task',
        value: { title: 't' }, debounceMs: 50,
      }),
    )
    act(() => result.current.clear())
    expect(loadDraft({ userId: USER, mode: 'work', draftType: 'task' })).toBeNull()
  })

  it('is a no-op when enabled=false (no draft is written)', () => {
    const { rerender } = renderHook(
      ({ value }: { value: string }) =>
        useModeDraft<string>({
          userId: USER, mode: 'inbox', draftType: 'reply',
          value, enabled: false, debounceMs: 50,
        }),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'should not save' })
    act(() => vi.advanceTimersByTime(200))
    expect(loadDraft({ userId: USER, mode: 'inbox', draftType: 'reply' })).toBeNull()
  })

  it('is a no-op when userId is empty (no draft is written)', () => {
    const { rerender } = renderHook(
      ({ value }: { value: string }) =>
        useModeDraft<string>({
          userId: '', mode: 'inbox', draftType: 'reply',
          value, debounceMs: 50,
        }),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'orphaned' })
    act(() => vi.advanceTimersByTime(200))
    // Empty userId means we can't even build a key, so nothing landed.
    expect(window.localStorage.length).toBe(0)
  })

  it('switching mode loads the other mode\'s draft', () => {
    saveDraft({ userId: USER, mode: 'inbox', draftType: 'reply' }, 'inbox-text')
    saveDraft({ userId: USER, mode: 'chat', draftType: 'reply' }, 'chat-text')
    const onLoad = vi.fn()
    const { rerender } = renderHook(
      ({ mode }: { mode: Mode }) =>
        useModeDraft<string>({
          userId: USER, mode, draftType: 'reply',
          value: '', onLoad,
        }),
      { initialProps: { mode: 'inbox' as Mode } },
    )
    expect(onLoad).toHaveBeenLastCalledWith(expect.objectContaining({ value: 'inbox-text' }))
    rerender({ mode: 'chat' })
    expect(onLoad).toHaveBeenLastCalledWith(expect.objectContaining({ value: 'chat-text' }))
  })

  it('updates savedAt after a successful save', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) =>
        useModeDraft<string>({
          userId: USER, mode: 'inbox', draftType: 'reply',
          value, debounceMs: 50,
        }),
      { initialProps: { value: '' } },
    )
    expect(result.current.savedAt).toBeNull()
    rerender({ value: 'first' })
    act(() => vi.advanceTimersByTime(75))
    expect(result.current.savedAt).not.toBeNull()
    expect(result.current.savedAt!).toBeGreaterThan(0)
  })

  it('cleanup helper removes user\'s drafts', () => {
    saveDraft({ userId: USER, mode: 'inbox', draftType: 'reply' }, 'gone')
    _clearAllDraftsForUser(USER)
    expect(loadDraft({ userId: USER, mode: 'inbox', draftType: 'reply' })).toBeNull()
  })
})
