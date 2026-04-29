/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ModeContextMenu } from '../mode-context-menu'
import {
  _buildAction,
  _setRegistryForTests,
  SEND_TO_EVENT_NAME,
  type SendToAction,
} from '@/lib/dashboard/send-to-registry'

function rightClick(el: Element) {
  fireEvent.contextMenu(el, { clientX: 100, clientY: 200 })
}

describe('<ModeContextMenu>', () => {
  let originalRegistry: SendToAction[]

  beforeEach(() => {
    originalRegistry = _setRegistryForTests([
      _buildAction({
        id: 't-inbox-work',
        sourceMode: 'inbox',
        targetMode: 'work',
        label: 'Make a task',
        description: 'Description here',
      }),
      _buildAction({
        id: 't-inbox-chat',
        sourceMode: 'inbox',
        targetMode: 'chat',
        label: 'Discuss',
      }),
    ])
  })

  afterEach(() => {
    _setRegistryForTests(originalRegistry)
  })

  it('does not render the menu by default', () => {
    render(
      <ModeContextMenu sourceMode="inbox" payload={{ id: 'msg' }}>
        <div data-testid="row">row</div>
      </ModeContextMenu>,
    )
    expect(screen.queryByTestId('mode-context-menu')).toBeNull()
  })

  it('opens on right-click and lists registry actions for the source mode', () => {
    render(
      <ModeContextMenu sourceMode="inbox" payload={{ id: 'msg' }}>
        <div data-testid="row">row</div>
      </ModeContextMenu>,
    )
    rightClick(screen.getByTestId('row'))
    const menu = screen.getByTestId('mode-context-menu')
    expect(menu).toBeTruthy()
    expect(menu.textContent).toContain('Make a task')
    expect(menu.textContent).toContain('Discuss')
    // Header label "Send to"
    expect(menu.textContent?.toLowerCase()).toContain('send to')
  })

  it('clicking an item dispatches bb-send-to and closes the menu', () => {
    const listener = vi.fn()
    window.addEventListener(SEND_TO_EVENT_NAME, listener as EventListener)

    render(
      <ModeContextMenu sourceMode="inbox" payload={{ id: 'msg-7' }}>
        <div data-testid="row">row</div>
      </ModeContextMenu>,
    )
    rightClick(screen.getByTestId('row'))
    fireEvent.click(screen.getByText(/Make a task/))

    expect(listener).toHaveBeenCalledOnce()
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail
    expect(detail.actionId).toBe('t-inbox-work')
    expect(detail.payload).toEqual({ id: 'msg-7' })
    // Menu should be closed after click
    expect(screen.queryByTestId('mode-context-menu')).toBeNull()

    window.removeEventListener(SEND_TO_EVENT_NAME, listener as EventListener)
  })

  it('escape key dismisses the menu', () => {
    render(
      <ModeContextMenu sourceMode="inbox" payload={{}}>
        <div data-testid="row">row</div>
      </ModeContextMenu>,
    )
    rightClick(screen.getByTestId('row'))
    expect(screen.queryByTestId('mode-context-menu')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('mode-context-menu')).toBeNull()
  })

  it('does not open when disabled', () => {
    render(
      <ModeContextMenu sourceMode="inbox" payload={{}} disabled>
        <div data-testid="row">row</div>
      </ModeContextMenu>,
    )
    rightClick(screen.getByTestId('row'))
    expect(screen.queryByTestId('mode-context-menu')).toBeNull()
  })

  it('does not open when the registry has no matching actions', () => {
    _setRegistryForTests([])
    render(
      <ModeContextMenu sourceMode="inbox" payload={{}}>
        <div data-testid="row">row</div>
      </ModeContextMenu>,
    )
    rightClick(screen.getByTestId('row'))
    expect(screen.queryByTestId('mode-context-menu')).toBeNull()
  })

  it('clamps menu position so it does not overflow the viewport', () => {
    // jsdom default viewport is 1024×768. Right-click near the bottom-right.
    render(
      <ModeContextMenu sourceMode="inbox" payload={{}}>
        <div data-testid="row">row</div>
      </ModeContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('row'), {
      clientX: window.innerWidth - 10,
      clientY: window.innerHeight - 10,
    })
    const menu = screen.getByTestId('mode-context-menu') as HTMLElement
    const left = parseFloat(menu.style.left)
    const top = parseFloat(menu.style.top)
    // Clamped values should leave room for the menu before the viewport edge.
    expect(left).toBeLessThan(window.innerWidth - 100)
    expect(top).toBeLessThan(window.innerHeight - 100)
    // And not allow negative positioning when far above/left.
    expect(left).toBeGreaterThanOrEqual(0)
    expect(top).toBeGreaterThanOrEqual(0)
  })

  it('right-clicking inside the open menu does not reposition it', () => {
    render(
      <ModeContextMenu sourceMode="inbox" payload={{}}>
        <div data-testid="row">row</div>
      </ModeContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('row'), { clientX: 50, clientY: 50 })
    const menu = screen.getByTestId('mode-context-menu') as HTMLElement
    const beforeLeft = menu.style.left
    const beforeTop = menu.style.top
    // Right-click an item inside the menu — must not reposition.
    fireEvent.contextMenu(screen.getByText(/Make a task/), { clientX: 400, clientY: 400 })
    expect(menu.style.left).toBe(beforeLeft)
    expect(menu.style.top).toBe(beforeTop)
  })

  it('declares aria-orientation=vertical on the menu role', () => {
    render(
      <ModeContextMenu sourceMode="inbox" payload={{}}>
        <div data-testid="row">row</div>
      </ModeContextMenu>,
    )
    rightClick(screen.getByTestId('row'))
    const menu = screen.getByTestId('mode-context-menu')
    expect(menu.getAttribute('role')).toBe('menu')
    expect(menu.getAttribute('aria-orientation')).toBe('vertical')
  })

  it('overrides intercept the default handler', () => {
    const listener = vi.fn()
    const override = vi.fn()
    window.addEventListener(SEND_TO_EVENT_NAME, listener as EventListener)

    render(
      <ModeContextMenu
        sourceMode="inbox"
        payload={{ id: 'm' }}
        overrides={{ 't-inbox-work': override }}
      >
        <div data-testid="row">row</div>
      </ModeContextMenu>,
    )
    rightClick(screen.getByTestId('row'))
    fireEvent.click(screen.getByText(/Make a task/))

    expect(override).toHaveBeenCalledOnce()
    expect(listener).not.toHaveBeenCalled()

    window.removeEventListener(SEND_TO_EVENT_NAME, listener as EventListener)
  })
})
