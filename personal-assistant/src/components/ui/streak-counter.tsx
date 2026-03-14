'use client'

import { Flame } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StreakCounterProps {
  currentStreak: number
  longestStreak: number
  todayCompleted: number
  className?: string
}

export function StreakCounter({
  currentStreak,
  longestStreak,
  todayCompleted,
  className,
}: StreakCounterProps) {
  const isPersonalBest = currentStreak > 0 && currentStreak >= longestStreak
  const hasGlow = currentStreak > 3

  if (currentStreak <= 0) {
    return (
      <div className={cn('flex flex-col items-center gap-0.5', className)}>
        <Flame className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">No streak</span>
        {todayCompleted > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {todayCompleted} done today
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col items-center gap-0.5', className)}>
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-1',
          'bg-[#D4A574]/10 text-[#D4A574]',
          hasGlow && 'animate-glow'
        )}
      >
        <Flame className={cn('h-4 w-4', hasGlow && 'animate-streak')} />
        <span className="text-sm font-bold tabular-nums">{currentStreak}</span>
      </div>
      <span className="text-[10px] font-medium text-muted-foreground">
        day streak
      </span>
      {isPersonalBest && (
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[#FBBF24]">
          Personal best!
        </span>
      )}
    </div>
  )
}
