/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModeSwitcher } from '../mode-switcher'
import { TooltipProvider } from '@/components/ui/tooltip'

beforeAll(() => {
  // jsdom does not implement matchMedia (ModeSwitcher reads prefers-reduced-motion)
  // or ResizeObserver (Radix Tooltip uses it). Provide minimal no-op shims.
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
})

function renderSwitcher(props: Partial<Parameters<typeof ModeSwitcher>[0]> = {}) {
  const defaultProps = {
    active: 'chat' as const,
    onSwitch: vi.fn(),
  }
  return {
    ...render(
      <TooltipProvider>
        <ModeSwitcher {...defaultProps} {...props} />
      </TooltipProvider>,
    ),
    onSwitch: defaultProps.onSwitch,
  }
}

function tab(label: string): HTMLElement {
  return screen.getByRole('tab', { name: new RegExp(label, 'i') })
}

describe('ModeSwitcher — unlocked behavior (default)', () => {
  it('renders all four mode tabs', () => {
    renderSwitcher()
    expect(tab('chat')).toBeTruthy()
    expect(tab('inbox')).toBeTruthy()
    expect(tab('work')).toBeTruthy()
    expect(tab('money')).toBeTruthy()
  })

  it('clicking a tab fires onSwitch with the mode id', () => {
    const { onSwitch } = renderSwitcher()
    fireEvent.click(tab('work'))
    expect(onSwitch).toHaveBeenCalledWith('work')
  })
})

describe('ModeSwitcher — locked tabs', () => {
  it('marks locked tabs with aria-disabled=true', () => {
    renderSwitcher({
      lockedModes: {
        work: { requiredPlan: 'growth' },
        money: { requiredPlan: 'growth' },
      },
    })
    expect(tab('work').getAttribute('aria-disabled')).toBe('true')
    expect(tab('money').getAttribute('aria-disabled')).toBe('true')
    expect(tab('chat').getAttribute('aria-disabled')).toBe('false')
  })

  it('clicking a locked tab fires onLockedModeClick instead of onSwitch', () => {
    const onSwitch = vi.fn()
    const onLockedModeClick = vi.fn()
    render(
      <TooltipProvider>
        <ModeSwitcher
          active="chat"
          onSwitch={onSwitch}
          lockedModes={{ money: { requiredPlan: 'growth' } }}
          onLockedModeClick={onLockedModeClick}
        />
      </TooltipProvider>,
    )

    fireEvent.click(tab('money'))

    expect(onSwitch).not.toHaveBeenCalled()
    expect(onLockedModeClick).toHaveBeenCalledWith('money', 'growth')
  })

  it('arrow-right skips over locked tabs', () => {
    const onSwitch = vi.fn()
    render(
      <TooltipProvider>
        <ModeSwitcher
          active="inbox"
          onSwitch={onSwitch}
          lockedModes={{ work: { requiredPlan: 'growth' } }}
        />
      </TooltipProvider>,
    )

    const tablist = screen.getByRole('tablist')
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })

    // From inbox, arrow-right would normally land on work — but work is
    // locked, so the next enabled mode (money) is selected instead.
    expect(onSwitch).toHaveBeenCalledWith('money')
  })

  it('does not surface aria-selected on a locked tab even if active matches it', () => {
    // Defensive: if a parent passes active="money" while money is locked
    // (e.g. plan downgrade race), the tab should not pretend to be selected.
    renderSwitcher({
      active: 'money',
      lockedModes: { money: { requiredPlan: 'growth' } },
    })
    expect(tab('money').getAttribute('aria-selected')).toBe('false')
  })
})
