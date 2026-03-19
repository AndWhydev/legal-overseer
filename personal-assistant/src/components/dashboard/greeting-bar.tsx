'use client'

import { ProgressRing } from '@/components/ui/progress-ring'
import { StreakCounter } from '@/components/ui/streak-counter'
import { StatsWidget } from './stats-widget'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function getFormattedDate() {
  return new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function getMotivation(pct: number) {
  if (pct >= 100) return 'All clear'
  if (pct >= 76) return 'Almost there'
  if (pct >= 51) return 'On a roll'
  if (pct >= 26) return 'Making progress'
  if (pct >= 1) return 'Getting started'
  return 'Clean slate'
}

interface GreetingBarProps {
  completedToday?: number
  totalToday?: number
  currentStreak?: number
  longestStreak?: number
}

export function GreetingBar({
  completedToday = 0,
  totalToday = 0,
  currentStreak = 0,
  longestStreak = 0,
}: GreetingBarProps) {
  const pct = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            {getGreeting()}
          </h1>
          <span className="text-xs text-muted-foreground">{getFormattedDate()}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {getMotivation(pct)}
        </p>
        <div className="mt-2">
          <StatsWidget />
        </div>
      </div>
      <div className="flex items-center gap-5">
        <ProgressRing value={pct} size={56} strokeWidth={4} label="Today" />
        <StreakCounter
          currentStreak={currentStreak}
          longestStreak={longestStreak}
          todayCompleted={completedToday}
        />
      </div>
    </div>
  )
}
