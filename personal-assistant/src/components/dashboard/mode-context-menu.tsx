/**
 * ModeContextMenu — wrap any element to give it a right-click "Send to →" menu.
 *
 * No new dependencies: this is a minimal portal-less floating menu positioned
 * at the cursor. It dismisses on outside-click, Escape, or item selection.
 *
 * Usage:
 *   <ModeContextMenu sourceMode="inbox" payload={message}>
 *     <div className="…">{...row content...}</div>
 *   </ModeContextMenu>
 *
 * The menu items are sourced from the send-to-registry. Click → executeSendToAction
 * fires (default = `bb-send-to` CustomEvent on window).
 */

'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Mode } from '@/lib/dashboard/mode-store'
import { useSendTo, type SendToOverrides } from '@/hooks/use-send-to'

export interface ModeContextMenuProps<TPayload> {
  sourceMode: Mode
  payload: TPayload
  /** Optional per-component handler overrides keyed by action id. */
  overrides?: SendToOverrides<TPayload>
  /** Disable the menu entirely (e.g. when modes flag is off). */
  disabled?: boolean
  /** Wrapped content. The menu is bound to `onContextMenu` on this child wrapper. */
  children: React.ReactNode
  className?: string
}

interface MenuPosition {
  x: number
  y: number
}

// Conservative menu bounds for viewport clamping. The actual rendered size
// depends on action count; these are tuned for the built-in registry.
const ESTIMATED_MENU_WIDTH = 240   // px — corresponds to min-w-[12rem] + padding
const ESTIMATED_MENU_HEIGHT = 280  // px — fits ~6 items with descriptions
const VIEWPORT_PADDING = 8         // px — keep the menu off the edge

function clampToViewport(x: number, y: number): MenuPosition {
  if (typeof window === 'undefined') return { x, y }
  const maxX = Math.max(VIEWPORT_PADDING, window.innerWidth - ESTIMATED_MENU_WIDTH - VIEWPORT_PADDING)
  const maxY = Math.max(VIEWPORT_PADDING, window.innerHeight - ESTIMATED_MENU_HEIGHT - VIEWPORT_PADDING)
  return {
    x: Math.min(Math.max(x, VIEWPORT_PADDING), maxX),
    y: Math.min(Math.max(y, VIEWPORT_PADDING), maxY),
  }
}

export function ModeContextMenu<TPayload>(props: ModeContextMenuProps<TPayload>) {
  const { sourceMode, payload, overrides, disabled, children, className } = props
  const { actions, execute } = useSendTo<TPayload>(sourceMode, payload, overrides)

  const [position, setPosition] = useState<MenuPosition | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => setPosition(null), [])

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || actions.length === 0) return
      // If the right-click originated inside the already-open menu, ignore it.
      // Otherwise the menu would reposition under the cursor of its own item.
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        e.preventDefault()
        return
      }
      e.preventDefault()
      setPosition(clampToViewport(e.clientX, e.clientY))
    },
    [disabled, actions.length],
  )

  // Outside-click + Escape dismissal.
  useEffect(() => {
    if (!position) return
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    // Defer registering click so the triggering right-click doesn't immediately close.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDocClick)
    }, 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [position, close])

  return (
    <div className={cn('relative', className)} onContextMenu={onContextMenu}>
      {children}
      {position && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          data-testid="mode-context-menu"
          className="fixed z-50 min-w-[12rem] rounded-md border bg-popover p-1 shadow-md text-sm text-popover-foreground"
          style={{ left: position.x, top: position.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Send to
          </div>
          {actions.map((action) => (
            <button
              key={action.id}
              role="menuitem"
              className="flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none"
              onClick={() => {
                close()
                void execute(action)
              }}
            >
              <span className="font-medium">
                {capitalize(action.targetMode)} <span className="text-muted-foreground">·</span> {action.label}
              </span>
              {action.description && (
                <span className="text-xs text-muted-foreground line-clamp-1">{action.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}
