'use client'

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Kbd — keyboard shortcut hint.
 *
 * Replaces inline `<kbd>` elements styled three different ways across the
 * app (raw, inline className, legacy `bb-shortcuts-key` class). Pure atom:
 * uses typography tokens (.nano) + theme colors. No component imports.
 *
 * Use case: shortcut hints in command palette, modes overlay, button trailing.
 */

export interface KbdProps {
  /** The key glyph(s). Single char (⌘, K, ↵) or word (Esc, Tab). */
  children: ReactNode
  /** Visual emphasis. `default` is muted; `solid` is filled (for active state). */
  variant?: 'default' | 'solid'
  className?: string
}

export function Kbd({ children, variant = 'default', className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex select-none items-center justify-center',
        'min-w-[1.5em] rounded-md border px-1.5 py-0.5',
        'font-mono nano',
        variant === 'default' &&
          'border-border bg-secondary text-muted-foreground',
        variant === 'solid' &&
          'border-foreground/20 bg-foreground text-background',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
