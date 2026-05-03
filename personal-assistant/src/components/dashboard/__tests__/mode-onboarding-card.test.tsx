/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ModeOnboardingCard } from '../mode-onboarding-card'

const USER = 'user-card-test'

function storageKey(mode: string): string {
  return `bitbit-onboarding:${USER}:${mode}`
}

describe('ModeOnboardingCard — render gates', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
  })

  it('renders nothing when userId is empty', () => {
    const { container } = render(<ModeOnboardingCard userId="" mode="money" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for chat mode (no required steps → isComplete is true)', () => {
    const { container } = render(<ModeOnboardingCard userId={USER} mode="chat" />)
    // chat-1 is optional, isComplete is true even with nothing done.
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing once every required step for the mode is done', () => {
    window.localStorage.setItem(
      storageKey('money'),
      JSON.stringify(['money-1-add-contact', 'money-2-create-invoice-draft', 'money-3-see-it-in-money-tab']),
    )
    const { container } = render(<ModeOnboardingCard userId={USER} mode="money" />)
    expect(container.firstChild).toBeNull()
  })
})

describe('ModeOnboardingCard — open state', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
  })

  it('shows the next required step for the mode', () => {
    render(<ModeOnboardingCard userId={USER} mode="money" />)
    // money-1 is the first money step.
    expect(screen.getByText(/Add your first contact/)).toBeTruthy()
    expect(screen.getByText(/Add a client/i)).toBeTruthy()
  })

  it('shows the step CTA label on the button', () => {
    render(<ModeOnboardingCard userId={USER} mode="money" />)
    expect(screen.getByRole('button', { name: /add contact/i })).toBeTruthy()
  })

  it('advances to the next step after CTA click', () => {
    const { rerender } = render(<ModeOnboardingCard userId={USER} mode="money" />)
    fireEvent.click(screen.getByRole('button', { name: /add contact/i }))
    rerender(<ModeOnboardingCard userId={USER} mode="money" />)
    // After completing money-1, money-2 is the next step.
    expect(screen.getByText(/Create an invoice draft/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /draft invoice/i })).toBeTruthy()
  })

  it('hides itself after the final required step is completed', () => {
    const { container, rerender } = render(<ModeOnboardingCard userId={USER} mode="inbox" />)
    expect(container.firstChild).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /connect/i }))
    rerender(<ModeOnboardingCard userId={USER} mode="inbox" />)
    // inbox-1-connect-channel is the only required step → completing it
    // makes isComplete=true. The card unmounts.
    expect(container.firstChild).toBeNull()
  })

  it('persists completed steps via the hook (debounced localStorage write)', () => {
    render(<ModeOnboardingCard userId={USER} mode="money" />)
    fireEvent.click(screen.getByRole('button', { name: /add contact/i }))

    act(() => {
      vi.advanceTimersByTime(250)
    })

    const stored = window.localStorage.getItem(storageKey('money'))
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toContain('money-1-add-contact')
  })
})
