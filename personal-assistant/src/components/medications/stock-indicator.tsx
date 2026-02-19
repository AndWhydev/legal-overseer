'use client'

import { cn } from '@/lib/utils'

interface StockIndicatorProps {
  health: 'green' | 'amber' | 'red'
  daysRemaining: number
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const healthColors: Record<string, string> = {
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-destructive',
}

const healthGlow: Record<string, string> = {
  green: 'shadow-[0_0_6px_rgba(124,170,133,0.4)]',
  amber: 'shadow-[0_0_6px_rgba(212,165,116,0.4)]',
  red: 'shadow-[0_0_6px_rgba(196,112,112,0.4)]',
}

const dotSizes: Record<string, string> = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
}

function getLabel(health: string, daysRemaining: number): string {
  if (health === 'red' && daysRemaining < 3) return `${daysRemaining}d — urgent!`
  if (health === 'red') return `${daysRemaining}d — refill soon`
  if (health === 'amber') return `${daysRemaining}d — refill soon`
  return `${daysRemaining}d`
}

export function StockIndicator({
  health,
  daysRemaining,
  showLabel = true,
  size = 'md',
}: StockIndicatorProps) {
  const isUrgent = health === 'red' && daysRemaining < 3

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'rounded-full',
          dotSizes[size],
          healthColors[health],
          healthGlow[health],
          isUrgent && 'animate-agent-pulse'
        )}
      />
      {showLabel && (
        <span
          className={cn(
            'text-[11px] tabular-nums',
            health === 'green' && 'text-success',
            health === 'amber' && 'text-warning',
            health === 'red' && 'text-destructive'
          )}
        >
          {getLabel(health, daysRemaining)}
        </span>
      )}
    </div>
  )
}
