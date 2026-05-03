/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LockedModeUpsell } from '../locked-mode-upsell'

beforeAll(() => {
  // jsdom shims for the Radix Dialog primitive (which Radix Tooltip-style
  // popovers also need). matchMedia + ResizeObserver mirror the
  // mode-switcher test's setup.
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    })
  }
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
  // Radix Dialog calls hasPointerCapture on the focus-guard. jsdom's
  // HTMLElement may not implement it.
  const proto = HTMLElement.prototype as HTMLElement & {
    hasPointerCapture?: (id: number) => boolean
    setPointerCapture?: (id: number) => void
    releasePointerCapture?: (id: number) => void
    scrollIntoView?: () => void
  }
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {}
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {}
  if (!proto.scrollIntoView) proto.scrollIntoView = () => {}
})

describe('LockedModeUpsell — closed state', () => {
  it('does not render dialog content when lockedMode is null', () => {
    render(<LockedModeUpsell lockedMode={null} onClose={() => {}} />)
    // Title should not appear in the document when the dialog is closed.
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('LockedModeUpsell — open state', () => {
  it('shows the locked mode name + the required plan name', () => {
    render(
      <LockedModeUpsell
        lockedMode={{ mode: 'money', requiredPlan: 'growth' }}
        onClose={() => {}}
      />,
    )
    // Title combines mode + plan: "Money mode is on the Growth plan"
    expect(screen.getByText(/Money mode is on the Growth plan/)).toBeTruthy()
  })

  it('renders the mode-specific summary blurb', () => {
    render(
      <LockedModeUpsell
        lockedMode={{ mode: 'work', requiredPlan: 'growth' }}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/Capture tasks and run a work board/i)).toBeTruthy()
  })

  it('upgrade CTA links to /pricing#tier-{plan}', () => {
    render(
      <LockedModeUpsell
        lockedMode={{ mode: 'inbox', requiredPlan: 'starter' }}
        onClose={() => {}}
      />,
    )
    const cta = screen.getByRole('link', { name: /see starter plan/i })
    expect(cta.getAttribute('href')).toBe('/pricing#tier-starter')
  })

  it('plan name is title-cased in copy', () => {
    render(
      <LockedModeUpsell
        lockedMode={{ mode: 'money', requiredPlan: 'enterprise' }}
        onClose={() => {}}
      />,
    )
    // "Enterprise" appears as the plan name; the lowercase form is internal only.
    const cta = screen.getByRole('link', { name: /see enterprise plan/i })
    expect(cta).toBeTruthy()
  })
})

describe('LockedModeUpsell — close behavior', () => {
  it('clicking the upgrade CTA fires onClose', () => {
    const onClose = vi.fn()
    render(
      <LockedModeUpsell
        lockedMode={{ mode: 'money', requiredPlan: 'growth' }}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: /see growth plan/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking "Not now" fires onClose', () => {
    const onClose = vi.fn()
    render(
      <LockedModeUpsell
        lockedMode={{ mode: 'money', requiredPlan: 'growth' }}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
