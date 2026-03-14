'use client'

import { useEffect, useState } from 'react'
import { SFCheckmarkCircle, SFFlame, SFRadio, SFExclamationmarkCircle } from 'sf-symbols-lib'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/core/logger'

interface StatsWidgetProps {
  className?: string
}

interface Stats {
  completedToday: number
  weeklyStreak: number
  channelsSynced: number
}

function CountUp({ target }: { target: number }) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (target === 0) { setValue(0); return }
    const duration = 500
    const start = performance.now()
    let raf: number

    function animate(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))
      if (progress < 1) raf = requestAnimationFrame(animate)
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [target])

  return <span className="tabular-nums">{value}</span>
}

export function StatsWidget({ className }: StatsWidgetProps) {
  const [stats, setStats] = useState<Stats>({
    completedToday: 0,
    weeklyStreak: 0,
    channelsSynced: 0,
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        setError(null)
        setIsLoading(true)

        const supabase = createClient()
        if (!supabase) {
          throw new Error('Failed to initialize database client')
        }

        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)

        // Count tasks completed today
        const { count: completedToday, error: err1 } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'done')
          .gte('updated_at', todayStart.toISOString())

        if (err1) throw err1

        // Count distinct active channels
        const { count: channelsSynced, error: err2 } = await supabase
          .from('tasks')
          .select('metadata->source_channel', { count: 'exact', head: true })
          .not('metadata->source_channel', 'is', null)

        if (err2) throw err2

        // Compute weekly streak: count consecutive days (going backwards) with at least 1 completed task
        let streak = 0
        const checkDate = new Date()
        checkDate.setHours(0, 0, 0, 0)

        for (let i = 0; i < 30; i++) {
          const dayStart = new Date(checkDate)
          const dayEnd = new Date(checkDate)
          dayEnd.setDate(dayEnd.getDate() + 1)

          const { count: dayCount, error: err3 } = await supabase
            .from('tasks')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'done')
            .gte('updated_at', dayStart.toISOString())
            .lt('updated_at', dayEnd.toISOString())

          if (err3) throw err3

          if ((dayCount ?? 0) > 0) {
            streak++
          } else if (i > 0) {
            // Allow today (i=0) to have zero completions without breaking streak
            break
          }

          checkDate.setDate(checkDate.getDate() - 1)
        }

        setStats({
          completedToday: completedToday ?? 0,
          weeklyStreak: streak,
          channelsSynced: Math.min(channelsSynced ?? 0, 5),
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        logger.error('Failed to fetch stats:', { error: errorMsg })
        setError('Failed to load statistics')
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [])

  const items = [
    {
      icon: SFCheckmarkCircle,
      value: stats.completedToday,
      label: 'Done today',
      color: '#7CAA85',
    },
    {
      icon: SFFlame,
      value: stats.weeklyStreak,
      label: 'Day streak',
      color: '#D4A574',
    },
    {
      icon: SFRadio,
      value: stats.channelsSynced,
      label: 'Channels',
      color: '#A78BFA',
    },
  ]

  if (error) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/20 border border-red-900/30 ${className ?? ''}`}>
        <SFExclamationmarkCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
        <span className="text-xs text-red-300">{error}</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-5 ${className ?? ''}`}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <item.icon className="h-3.5 w-3.5" style={{ color: item.color }} />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-foreground leading-none">
              {isLoading ? '–' : <CountUp target={item.value} />}
            </span>
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
