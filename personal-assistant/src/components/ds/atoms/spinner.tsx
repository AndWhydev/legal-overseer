'use client'

import { IconLoader2 } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/**
 * Spinner — canonical loading indicator.
 *
 * Replaces:
 *   - inline `<IconLoader2 className="size-4 animate-spin" />` (10+ sites)
 *   - ui/spinner.tsx (4 sites — sweep target)
 *
 * Pure atom: uses .icon-{size} tokens + Tabler IconLoader2 + animate-spin.
 * For "agent thinking" pulse-dot indicator (different visual), see PulseDots
 * atom (planned).
 */

export interface SpinnerProps {
  /** Canonical icon size. Default 'sm' (16px). */
  size?: IconSize
  /** Optional color override (Tailwind color class). */
  className?: string
  /** Accessible label. Default "Loading". */
  label?: string
}

export function Spinner({
  size = 'sm',
  className,
  label = 'Loading',
}: SpinnerProps) {
  return (
    <IconLoader2
      role="status"
      aria-label={label}
      className={cn(`icon-${size} animate-spin`, className)}
    />
  )
}
