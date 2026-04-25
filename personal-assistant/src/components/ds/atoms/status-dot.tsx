'use client'

import { cn } from '@/lib/utils'

/**
 * StatusDot — canonical inline status indicator.
 *
 * Replaces 5+ ad-hoc patterns:
 *   <span className="size-2 rounded-full bg-emerald-500" />   (channel-card)
 *   <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> (kanban)
 *   ...etc.
 *
 * Two variant tracks: semantic status (success/warning/danger/info/muted)
 * and trend (active/stable/cooling/cold — monochrome with descending opacity,
 * matches the static DS relationships card).
 *
 * `label` is REQUIRED — screen readers must announce the state in words.
 * Opacity-only or color-only signaling fails accessibility audits.
 */

export type StatusDotVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'muted'
  | 'active'
  | 'stable'
  | 'cooling'
  | 'cold'

export interface StatusDotProps {
  variant?: StatusDotVariant
  /** Pixel size. Default 8 (small inline). */
  size?: 6 | 8 | 10 | 12
  /** Pulse animation for live/active state. */
  pulse?: boolean
  /** Required: semantic state announced to screen readers. */
  label: string
  className?: string
}

const variantStyles: Record<StatusDotVariant, string> = {
  // Semantic status
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
  info:    'bg-sky-500',
  muted:   'bg-muted-foreground',
  // Trend (monochrome — descending opacity)
  active:  'bg-foreground opacity-95',
  stable:  'bg-foreground opacity-60',
  cooling: 'bg-foreground opacity-30',
  cold:    'bg-foreground opacity-15 ring-1 ring-inset ring-border',
}

export function StatusDot({
  variant = 'muted',
  size = 8,
  pulse = false,
  label,
  className,
}: StatusDotProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block shrink-0 rounded-full',
        variantStyles[variant],
        pulse && 'animate-pulse',
        className,
      )}
      style={{ width: size, height: size }}
    />
  )
}
