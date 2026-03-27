'use client'

import { useEffect, useState } from 'react'
import { IconDatabase, IconAlertCircle, IconLoader2, IconCurrencyDollar, IconAlertTriangle } from '@tabler/icons-react'
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { logger } from '@/lib/core/logger'

interface RagStats {
  totalVectors: number
  namespaceVectors: Record<string, number>
  indexFullness: number
  lastUpdated: string
}

interface CostEstimate {
  monthlyCost: number
  storageCost: number
  queryCost: number
  metadataCost: number
  costPer1MVectors: number
}

interface MonitoringAlert {
  level: 'info' | 'warning' | 'critical'
  message: string
  metric: string
  currentValue: number
  threshold?: number
}

interface MonitoringReport {
  stats: RagStats | null
  costs: CostEstimate | null
  alerts: MonitoringAlert[]
}

interface RagStatsWidgetProps {
  className?: string
  showDetails?: boolean
}

function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (target === 0) {
      setValue(0)
      return
    }
    const duration = 600
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

  return (
    <span className="font-mono font-medium">
      {value.toLocaleString()}{suffix}
    </span>
  )
}

export function RagStatsWidget({ className = '', showDetails = true }: RagStatsWidgetProps) {
  const [stats, setStats] = useState<RagStats | null>(null)
  const [costs, setCosts] = useState<CostEstimate | null>(null)
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchMonitoringData() {
      try {
        setError(null)
        setLoading(true)
        const res = await fetch('/api/rag/monitor')
        if (!res.ok) throw new Error('Failed to fetch monitoring data')
        const data = (await res.json()) as MonitoringReport

        if (!data.stats) {
          const legacyRes = await fetch('/api/rag/stats')
          if (legacyRes.ok) {
            const legacyData = (await legacyRes.json()) as RagStats
            setStats(legacyData)
          }
        } else {
          setStats(data.stats)
        }

        setCosts(data.costs)
        setAlerts(data.alerts)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        logger.error('Failed to fetch RAG monitoring data:', { error: errorMsg })
        setError('Failed to load vector stats')
      } finally {
        setLoading(false)
      }
    }

    fetchMonitoringData()
  }, [])

  if (error) {
    return (
      <Empty className={className}>
        <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
        <EmptyTitle>{"Couldn't load vector stats"}</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
      </Empty>
    )
  }

  if (loading || !stats) {
    return (
      <div className={`flex items-center gap-2 rounded-xl border border-border bg-card p-4 ${className}`}>
        <IconLoader2 size={16} className="shrink-0 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading vector stats...</span>
      </div>
    )
  }

  const topChannels = stats
    ? Object.entries(stats.namespaceVectors)
        .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
        .slice(0, 5)
    : []

  const criticalAlerts = alerts.filter(a => a.level === 'critical')
  const warningAlerts = alerts.filter(a => a.level === 'warning')

  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      <div className="mb-3 flex items-center gap-2 border-b border-border pb-3">
        <IconDatabase size={16} className="text-foreground" />
        <h3 className="text-sm font-medium text-foreground">Vector Index</h3>
      </div>

      <div className="flex flex-col gap-3">
        {/* Total vectors */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-muted-foreground">Total Vectors</span>
          <span className="text-base font-medium text-foreground">
            {loading ? '\u2013' : <CountUp target={stats?.totalVectors ?? 0} />}
          </span>
        </div>

        {/* Index fullness */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-muted-foreground">Index Capacity</span>
          <span className={`text-base font-medium ${
            stats && stats.indexFullness >= 90 ? 'text-red-500' :
            stats && stats.indexFullness >= 70 ? 'text-amber-500' :
            'text-foreground'
          }`}>
            {loading ? '\u2013' : <CountUp target={stats?.indexFullness ?? 0} suffix="%" />}
          </span>
        </div>

        {/* Monthly cost estimate */}
        {costs && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-muted-foreground">Est. Monthly Cost</span>
            <span className="flex items-center gap-1 text-base font-medium text-foreground">
              <IconCurrencyDollar size={14} className="text-emerald-500" />
              {costs.monthlyCost.toFixed(2)}
            </span>
          </div>
        )}

        {/* Critical alerts */}
        {criticalAlerts.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-red-900/30 bg-red-950/20 p-2">
            <IconAlertTriangle size={14} className="mt-1 shrink-0 text-red-500" />
            <span className="text-sm leading-snug text-red-300">
              {criticalAlerts[0].message}
            </span>
          </div>
        )}

        {/* Warning alerts */}
        {!criticalAlerts.length && warningAlerts.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-900/30 bg-amber-950/20 p-2">
            <IconAlertCircle size={14} className="mt-1 shrink-0 text-amber-500" />
            <span className="text-sm leading-snug text-amber-300">
              {warningAlerts[0].message}
            </span>
          </div>
        )}

        {/* Channel breakdown */}
        {showDetails && topChannels.length > 0 && (
          <>
            <div className="mt-2 border-t border-border pt-2" />
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              TOP CHANNELS
            </div>
            <div className="flex flex-col gap-2">
              {topChannels.map(([channel, count]) => (
                <div key={channel} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    {channel}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {(count ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Last updated */}
        <div className="mt-2 text-right text-sm text-muted-foreground/60">
          {stats?.lastUpdated ? new Date(stats.lastUpdated).toLocaleTimeString() : 'Loading...'}
        </div>
      </div>
    </div>
  )
}
