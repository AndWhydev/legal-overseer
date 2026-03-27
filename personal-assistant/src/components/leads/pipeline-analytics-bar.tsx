'use client'

import React, { memo } from 'react'
import {
  IconCurrencyDollar,
  IconTarget,
  IconClock,
  IconBolt,
  IconAlertTriangle,
} from '@tabler/icons-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { PipelineAnalytics } from '@/lib/leads/types'
import { formatPipelineValue } from '@/lib/leads/utils'

interface PipelineAnalyticsBarProps {
  analytics: PipelineAnalytics | null
  isLoading: boolean
}

function getSpeedColor(minutes: number | null): string {
  if (minutes == null) return 'text-muted-foreground'
  if (minutes <= 5) return 'text-emerald-500'
  if (minutes <= 30) return 'text-yellow-500'
  return 'text-destructive'
}

function PipelineAnalyticsBarInner({ analytics, isLoading }: PipelineAnalyticsBarProps) {
  if (isLoading || !analytics) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }

  const speedMinutes = analytics.avgSpeedToLeadMinutes
  const speedDisplay = speedMinutes != null
    ? (speedMinutes < 60 ? `${speedMinutes}m` : `${Math.floor(speedMinutes / 60)}h ${speedMinutes % 60}m`)
    : '--'

  const stats = [
    { icon: IconCurrencyDollar, label: 'Pipeline Value', value: formatPipelineValue(analytics.totalValue), color: '' },
    { icon: IconTarget, label: 'Conversion Rate', value: `${analytics.conversionRate}%`, color: '' },
    { icon: IconClock, label: 'Avg Days in Stage', value: `${analytics.avgDaysInStage}d`, color: '' },
    { icon: IconBolt, label: 'Speed-to-Lead', value: speedDisplay, color: getSpeedColor(speedMinutes) },
    { icon: IconAlertTriangle, label: 'Stale Leads', value: String(analytics.staleCount), color: analytics.staleCount > 0 ? 'text-yellow-500' : '' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {stats.map((stat) => (
        <Card key={stat.label} className="gap-2 py-4">
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <stat.icon data-icon />
              {stat.label}
            </div>
            <div className={cn('text-base font-medium font-mono', stat.color || 'text-foreground')}>
              {stat.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export const PipelineAnalyticsBar = memo(PipelineAnalyticsBarInner)
