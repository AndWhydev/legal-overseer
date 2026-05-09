/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModeRecipesMenu } from '../mode-recipes-menu'
import {
  SEND_TO_EVENT_NAME,
  _setRegistryForTests,
  _buildAction,
  type SendToAction,
} from '@/lib/dashboard/send-to-registry'

beforeAll(() => {
  // jsdom shims for Radix Dropdown / focus-guard internals.
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

describe('ModeRecipesMenu — empty state', () => {
  let originalRegistry: SendToAction[]

  beforeEach(() => {
    // Empty Send-To registry → recipe steps reference no real actions, but
    // recipes still appear in MODE_RECIPES. Filter is by origin mode only.
    originalRegistry = _setRegistryForTests([])
  })

  afterEach(() => {
    _setRegistryForTests(originalRegistry)
  })

  it('renders nothing when no recipes match the active mode', () => {
    // No mode in MODE_RECIPES has zero recipes today, but the gate exists
    // for forward-compat — verify by passing a junk mode cast.
    const { container } = render(
      <ModeRecipesMenu mode={'unknown' as never} />
    )
    expect(container.firstChild).toBeNull()
  })
})

function openMenu(): void {
  const trigger = screen.getByRole('button', { name: /cross-mode recipes/i })
  // Radix DropdownMenu listens to pointerdown on the trigger; testing-library's
  // fireEvent.click only emits a click event, which Radix ignores.
  fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
  fireEvent.click(trigger)
}

describe('ModeRecipesMenu — open state', () => {
  it('renders a Recipes trigger button for modes with recipes', () => {
    render(<ModeRecipesMenu mode="money" />)
    const trigger = screen.getByRole('button', { name: /cross-mode recipes/i })
    expect(trigger).toBeTruthy()
  })

  it('opens a menu showing the origin-mode recipes when clicked', () => {
    render(<ModeRecipesMenu mode="money" />)
    openMenu()
    // Money mode has the "Chase overdue invoice" recipe per #102 seed.
    expect(screen.getByText(/Chase overdue invoice/i)).toBeTruthy()
  })

  it('shows the recipe description in the menu item', () => {
    render(<ModeRecipesMenu mode="inbox" />)
    openMenu()
    // Inbox has "Triage to every mode" with a fan-out description.
    expect(screen.getByText(/fan it out in one click/i)).toBeTruthy()
  })

  it('does not surface recipes from other origin modes', () => {
    render(<ModeRecipesMenu mode="money" />)
    openMenu()
    // The chat-origin recipe should not appear under money.
    expect(screen.queryByText(/Capture to every mode/i)).toBeNull()
  })
})

describe('ModeRecipesMenu — execute', () => {
  let originalRegistry: SendToAction[]

  beforeEach(() => {
    originalRegistry = _setRegistryForTests([
      _buildAction({
        id: 'money-to-work-task',
        sourceMode: 'money',
        targetMode: 'work',
        label: 'Test',
      }),
      _buildAction({
        id: 'money-to-chat',
        sourceMode: 'money',
        targetMode: 'chat',
        label: 'Test',
      }),
    ])
  })

  afterEach(() => {
    _setRegistryForTests(originalRegistry)
  })

  it('clicking an item fans out send-to events for each step', async () => {
    const events: string[] = []
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { actionId: string }
      events.push(detail.actionId)
    }
    window.addEventListener(SEND_TO_EVENT_NAME, listener)

    render(<ModeRecipesMenu mode="money" />)
    openMenu()
    fireEvent.click(screen.getByText(/Chase overdue invoice/i))

    // executeRecipe is async; flush microtasks.
    await Promise.resolve()
    await Promise.resolve()

    expect(events).toEqual(['money-to-work-task', 'money-to-chat'])

    window.removeEventListener(SEND_TO_EVENT_NAME, listener)
  })
})
