'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Flame, Radio } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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

  useEffect(() => {
    async function fetchStats() {
      const supabase = createClient()
      if (!supabase) return

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      // Count tasks completed today
      const { count: completedToday } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'done')
        .gte('updated_at', todayStart.toISOString())

      // Count distinct active channels
      const { count: channelsSynced } = await supabase
        .from('tasks')
        .select('metadata->source_channel', { count: 'exact', head: true })
        .not('metadata->source_channel', 'is', null)

      setStats({
        completedToday: completedToday ?? 0,
        weeklyStreak: 0, // TODO: compute from daily completion history
        channelsSynced: Math.min(channelsSynced ?? 0, 5),
      })
    }

    fetchStats()
  }, [])

  const items = [
    {
      icon: CheckCircle2,
      value: stats.completedToday,
      label: 'Done today',
      color: '#7CAA85',
    },
    {
      icon: Flame,
      value: stats.weeklyStreak,
      label: 'Day streak',
      color: '#D4A574',
    },
    {
      icon: Radio,
      value: stats.channelsSynced,
      label: 'Channels',
      color: '#A78BFA',
    },
  ]

  return (
    <div className={`flex items-center gap-5 ${className ?? ''}`}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <item.icon className="h-3.5 w-3.5" style={{ color: item.color }} />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-foreground leading-none">
              <CountUp target={item.value} />
            </span>
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
