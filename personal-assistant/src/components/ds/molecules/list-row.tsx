'use client'

import { type MouseEventHandler, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * ListRow — canonical clickable row primitive.
 *
 * Captures the structural shape shared by ~50 row implementations across
 * activity, leads, channels, widgets, dashboard, and inbox sidebar:
 *   [leading]  [content]                      [trailing]
 *
 * Owns: button element with native a11y, hover/selected backgrounds,
 *       horizontal layout, and standard padding.
 * Does NOT own: typography or colors of content. Compose those at the call
 *               site using Tailwind utilities or DS title primitives.
 *
 * Replaces: bespoke row containers in activity-item.tsx, lead-card.tsx,
 *           inbox-list.tsx, and channel/widget/dashboard equivalents.
 */
export interface ListRowProps {
  /** Leading slot — avatar, favicon, status dot, icon. Auto-shrinks. */
  leading?: ReactNode
  /** Trailing slot — action button, chevron, meta tag. Auto-shrinks. */
  trailing?: ReactNode
  /** Visual selected state — sets data-selected and selected background. */
  selected?: boolean
  /** Click handler. Renders as <button>; pass `as="div"` to use a div. */
  onClick?: MouseEventHandler<HTMLButtonElement | HTMLDivElement>
  /** Override or extend the row's className. */
  className?: string
  /** Accessible label when content alone isn't descriptive. */
  ariaLabel?: string
  /** Default = `px-2.5 py-2` (24px tall content). `sm` = `px-2 py-1.5`. */
  size?: 'sm' | 'default'
  /** Use a div wrapper instead of <button>. Useful for drag-and-drop rows. */
  as?: 'button' | 'div'
  /** Row body — caller decides typography + layout. */
  children: ReactNode
}

export function ListRow({
  leading,
  trailing,
  selected,
  onClick,
  className,
  ariaLabel,
  size = 'default',
  as = 'button',
  children,
}: ListRowProps) {
  const containerClasses = cn(
    'group flex w-full items-start gap-2.5 rounded-lg text-left transition-colors',
    'hover:bg-secondary',
    'data-[selected]:bg-secondary',
    size === 'sm' ? 'px-2 py-1.5' : 'px-2.5 py-2',
    className,
  )

  const inner = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">{children}</div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </>
  )

  if (as === 'div') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick as MouseEventHandler<HTMLDivElement>}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && onClick) {
            e.preventDefault()
            ;(onClick as MouseEventHandler<HTMLDivElement>)(e as unknown as React.MouseEvent<HTMLDivElement>)
          }
        }}
        data-selected={selected || undefined}
        aria-label={ariaLabel}
        className={containerClasses}
      >
        {inner}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick as MouseEventHandler<HTMLButtonElement>}
      data-selected={selected || undefined}
      aria-label={ariaLabel}
      className={containerClasses}
    >
      {inner}
    </button>
  )
}
