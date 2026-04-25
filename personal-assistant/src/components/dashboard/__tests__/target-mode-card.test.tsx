// @vitest-environment jsdom
/**
 * target-mode-card.test.tsx — RTL tests for ModeActionCard
 *
 * Cases:
 *   (e) Clicking a card with targetMode: 'money' calls switchMode('money') exactly once
 *   (f) Card with targetMode + selectionId also sets sidebar selection
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ─── Mock useModeStoreOptional ────────────────────────────────────────────────

const mockSwitchMode = vi.fn()
const mockSetSidebarSelection = vi.fn()
const mockStore = {
  state: { active: 'chat' as const, perMode: {} },
  switchMode: mockSwitchMode,
  setLastTab: vi.fn(),
  setScrollY: vi.fn(),
  setSidebarSelection: mockSetSidebarSelection,
  restoreFromMode: vi.fn(),
}

vi.mock('@/lib/dashboard/mode-store', () => ({
  useModeStoreOptional: () => mockStore,
}))

// ─── Mock isDashboardModesEnabled to return true ──────────────────────────────

vi.mock('@/lib/dashboard/feature-flag', () => ({
  isDashboardModesEnabled: () => true,
}))

// ─── Import after mocks ───────────────────────────────────────────────────────

import { ModeActionCard } from '../mode-action-card'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ModeActionCard — targetMode teleport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock window.dispatchEvent to avoid real DOM events in tests
    vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)
  })

  it('(e) clicking card with targetMode: money calls switchMode exactly once', () => {
    render(
      <ModeActionCard
        data={{
          label: 'View invoices',
          description: 'You have 3 overdue invoices',
          targetMode: 'money',
        }}
      />
    )

    const button = screen.getByRole('button', { name: /view invoices/i })
    fireEvent.click(button)

    expect(mockSwitchMode).toHaveBeenCalledTimes(1)
    expect(mockSwitchMode).toHaveBeenCalledWith('money')
  })

  it('(e) switchMode is NOT called when card has no targetMode', () => {
    render(
      <ModeActionCard
        data={{
          label: 'No mode card',
        }}
      />
    )

    const button = screen.getByRole('button', { name: /no mode card/i })
    fireEvent.click(button)

    expect(mockSwitchMode).not.toHaveBeenCalled()
  })

  it('(f) card with targetMode + selectionId also calls setSidebarSelection', () => {
    render(
      <ModeActionCard
        data={{
          label: 'Go to inbox item',
          targetMode: 'inbox',
          targetPageId: 'inbox',
          selectionId: 'msg-abc-123',
        }}
      />
    )

    const button = screen.getByRole('button', { name: /go to inbox item/i })
    fireEvent.click(button)

    // switchMode called first
    expect(mockSwitchMode).toHaveBeenCalledTimes(1)
    expect(mockSwitchMode).toHaveBeenCalledWith('inbox')

    // setSidebarSelection called with the selectionId
    expect(mockSetSidebarSelection).toHaveBeenCalledTimes(1)
    expect(mockSetSidebarSelection).toHaveBeenCalledWith('msg-abc-123')
  })

  it('(f) card with targetPageId dispatches bb-navigate event', () => {
    render(
      <ModeActionCard
        data={{
          label: 'Go to work',
          targetMode: 'work',
          targetPageId: 'tasks',
        }}
      />
    )

    const button = screen.getByRole('button', { name: /go to work/i })
    fireEvent.click(button)

    expect(window.dispatchEvent).toHaveBeenCalled()
    const calls = (window.dispatchEvent as ReturnType<typeof vi.spyOn>).mock.calls
    const navigateCall = calls.find(
      ([event]: [Event]) => event instanceof CustomEvent && event.type === 'bb-navigate'
    )
    expect(navigateCall).toBeTruthy()
    const event = navigateCall![0] as CustomEvent
    expect(event.detail).toEqual({ tabId: 'tasks' })
  })
})
