/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useModeTabBadge } from '../use-mode-tab-badge'

describe('useModeTabBadge', () => {
  beforeEach(() => {
    document.title = 'BitBit'
    // Strip any leftover favicon link from previous test
    document.getElementById('bb-mode-favicon')?.remove()
  })

  afterEach(() => {
    document.getElementById('bb-mode-favicon')?.remove()
  })

  it('does not modify document.title when mode is undefined (flag-off)', () => {
    const before = document.title
    renderHook(() => useModeTabBadge(undefined))
    expect(document.title).toBe(before)
  })

  it('does not insert a favicon link when mode is undefined', () => {
    renderHook(() => useModeTabBadge(undefined))
    expect(document.getElementById('bb-mode-favicon')).toBeNull()
  })

  it('updates document.title with mode prefix when mode is set', () => {
    renderHook(() => useModeTabBadge('inbox'))
    expect(document.title).toBe('[Inbox] BitBit')
  })

  it('adds unread count to title when provided', () => {
    renderHook(() => useModeTabBadge('inbox', 5))
    expect(document.title).toBe('[Inbox · 5] BitBit')
  })

  it('inserts a #bb-mode-favicon link element', () => {
    renderHook(() => useModeTabBadge('money'))
    const link = document.getElementById('bb-mode-favicon') as HTMLLinkElement | null
    expect(link).not.toBeNull()
    expect(link?.rel).toBe('icon')
    expect(link?.href.startsWith('data:image/svg+xml')).toBe(true)
  })

  it('updates favicon href when mode changes', () => {
    const { rerender } = renderHook(({ mode }: { mode: 'chat' | 'inbox' }) => useModeTabBadge(mode), {
      initialProps: { mode: 'chat' as 'chat' | 'inbox' },
    })
    const firstHref = (document.getElementById('bb-mode-favicon') as HTMLLinkElement).href
    rerender({ mode: 'inbox' })
    const secondHref = (document.getElementById('bb-mode-favicon') as HTMLLinkElement).href
    expect(secondHref).not.toBe(firstHref)
  })

  it('restores the previous title on unmount', () => {
    const before = document.title
    const { unmount } = renderHook(() => useModeTabBadge('work'))
    expect(document.title).toBe('[Work] BitBit')
    unmount()
    expect(document.title).toBe(before)
  })

  it('removes the override favicon link on unmount so page favicons are restored', () => {
    const { unmount } = renderHook(() => useModeTabBadge('work'))
    expect(document.getElementById('bb-mode-favicon')).not.toBeNull()
    unmount()
    expect(document.getElementById('bb-mode-favicon')).toBeNull()
  })

  it('removes the override favicon link when mode flips to undefined', () => {
    const { rerender } = renderHook(
      ({ mode }: { mode: 'work' | undefined }) => useModeTabBadge(mode),
      { initialProps: { mode: 'work' as 'work' | undefined } },
    )
    expect(document.getElementById('bb-mode-favicon')).not.toBeNull()
    rerender({ mode: undefined })
    expect(document.getElementById('bb-mode-favicon')).toBeNull()
    expect(document.title).toBe('BitBit')
  })

  it('does not compound the badge across rerenders (uses page title as base, not previous badged title)', () => {
    const { rerender } = renderHook(({ mode }: { mode: 'chat' | 'inbox' }) => useModeTabBadge(mode), {
      initialProps: { mode: 'chat' as 'chat' | 'inbox' },
    })
    expect(document.title).toBe('[Chat] BitBit')
    rerender({ mode: 'inbox' })
    expect(document.title).toBe('[Inbox] BitBit')
  })
})
