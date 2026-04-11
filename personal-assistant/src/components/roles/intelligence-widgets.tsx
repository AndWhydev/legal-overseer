'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  IconRadar,
  IconHeartbeat,
  IconTrendingUp,
  IconGauge,
  IconAlertTriangle,
} from '@tabler/icons-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IntelligenceData {
  revenueRadar: {
    totalEstimatedValue: number
    opportunities: number
    clientsAnalyzed: number
    gatheringData: boolean
  } | null
  clientHealth: {
    averageScore: number
    clientsScored: number
    gatheringData: boolean
  } | null
  cashFlow: {
    currentNet: number
    alerts: number
    gatheringData: boolean
  } | null
  capacity: {
    utilizationPercent: number
    status: string
    alerts: number
    gatheringData: boolean
  } | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WIDGET_DEFS = [
  {
    key: 'revenueRadar',
    label: 'Revenue Radar',
    icon: IconRadar,
    colorClass: 'text-foreground bg-muted',
    extract: (d: IntelligenceData) => d.revenueRadar,
    format: (data: any) => ({
      value: data.gatheringData ? '--' : `$${(data.totalEstimatedValue / 1000).toFixed(1)}k`,
      subtitle: data.gatheringData ? 'Gathering data...' : `${data.opportunities} opportunities`,
      alert: data.opportunities > 0,
    }),
  },
  {
    key: 'clientHealth',
    label: 'Client Health',
    icon: IconHeartbeat,
    colorClass: 'text-emerald-500 bg-emerald-500/10',
    extract: (d: IntelligenceData) => d.clientHealth,
    format: (data: any) => ({
      value: data.gatheringData ? '--' : `${data.averageScore}`,
      subtitle: data.gatheringData ? 'Gathering data...' : `${data.clientsScored} clients scored`,
      alert: !data.gatheringData && data.averageScore < 50,
    }),
  },
  {
    key: 'cashFlow',
    label: 'Cash Flow',
    icon: IconTrendingUp,
    colorClass: 'text-blue-500 bg-blue-500/10',
    extract: (d: IntelligenceData) => d.cashFlow,
    format: (data: any) => ({
      value: data.gatheringData ? '--' : `$${(data.currentNet / 1000).toFixed(1)}k`,
      subtitle: data.gatheringData ? 'Gathering data...' : `${data.alerts} alert${data.alerts !== 1 ? 's' : ''}`,
      alert: data.alerts > 0,
    }),
  },
  {
    key: 'capacity',
    label: 'Capacity',
    icon: IconGauge,
    colorClass: 'text-violet-500 bg-violet-500/10',
    extract: (d: IntelligenceData) => d.capacity,
    format: (data: any) => ({
      value: data.gatheringData ? '--' : `${data.utilizationPercent}%`,
      subtitle: data.gatheringData ? 'Gathering data...' : data.status,
      alert: !data.gatheringData && (data.status === 'overloaded' || data.status === 'heavy'),
    }),
  },
] as const

// ---------------------------------------------------------------------------
// Fetch helpers (exported for testability)
// ---------------------------------------------------------------------------

export async function mapIntelligenceResponses(
  revenueRes: Response | null,
  healthRes: Response | null,
  cashFlowRes: Response | null,
  capacityRes: Response | null,
): Promise<IntelligenceData> {
  const revenue = revenueRes?.ok ? (await revenueRes.json()).data : null
  const health = healthRes?.ok ? (await healthRes.json()).data : null
  const cashFlow = cashFlowRes?.ok ? (await cashFlowRes.json()).data : null
  const capacity = capacityRes?.ok ? (await capacityRes.json()).data : null

  return {
    revenueRadar: revenue ? {
      totalEstimatedValue: revenue.totalEstimatedValue ?? 0,
      opportunities: Array.isArray(revenue.opportunities) ? revenue.opportunities.length : 0,
      clientsAnalyzed: revenue.clientsAnalyzed ?? 0,
      gatheringData: revenue.gatheringData ?? true,
    } : null,
    clientHealth: health ? {
      averageScore: health.averageScore ?? 0,
      clientsScored: health.clientsScored ?? 0,
      gatheringData: health.gatheringData ?? true,
    } : null,
    cashFlow: cashFlow ? {
      currentNet: cashFlow.currentMonth?.net ?? 0,
      alerts: Array.isArray(cashFlow.alerts) ? cashFlow.alerts.length : 0,
      gatheringData: cashFlow.gatheringData ?? true,
    } : null,
    capacity: capacity ? {
      utilizationPercent: capacity.utilizationPercent ?? 0,
      status: capacity.status ?? 'unknown',
      alerts: Array.isArray(capacity.alerts) ? capacity.alerts.length : 0,
      gatheringData: capacity.gatheringData ?? true,
    } : null,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IntelligenceWidgets() {
  const [data, setData] = useState<IntelligenceData>({
    revenueRadar: null,
    clientHealth: null,
    cashFlow: null,
    capacity: null,
  })
  const [loading, setLoading] = useState(true)

  const fetchIntelligence = useCallback(async () => {
    try {
      const [revenueRes, healthRes, cashFlowRes, capacityRes] = await Promise.all([
        fetch('/api/intelligence/revenue-radar').catch(() => null),
        fetch('/api/intelligence/client-health').catch(() => null),
        fetch('/api/intelligence/cash-flow').catch(() => null),
        fetch('/api/intelligence/capacity').catch(() => null),
      ])

      const mapped = await mapIntelligenceResponses(revenueRes, healthRes, cashFlowRes, capacityRes)
      setData(mapped)
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchIntelligence()
    const interval = setInterval(fetchIntelligence, 60000)
    return () => clearInterval(interval)
  }, [fetchIntelligence])

  return (
    <div>
      <h3 className="text-base font-medium uppercase tracking-wider text-muted-foreground mb-3">Intelligence</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {WIDGET_DEFS.map(widget => {
          const widgetData = widget.extract(data)
          const Icon = widget.icon
          const formatted = widgetData ? widget.format(widgetData) : null

          return (
            <Card key={widget.key} className="py-4 hover:bg-muted transition-colors">
              <CardContent>
                {/* Header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-6.5 h-6.5 rounded-lg flex items-center justify-center ${widget.colorClass}`}>
                    <Icon size={13} />
                  </div>
                  <span className="text-base font-medium text-muted-foreground">{widget.label}</span>
                  {formatted?.alert && (
                    <IconAlertTriangle size={11} className="text-amber-500 ml-auto" />
                  )}
                </div>

                {/* Value */}
                {loading || !formatted ? (
                  <Skeleton className="h-7 w-1/2 mb-2" />
                ) : (
                  <div className="text-xl font-medium text-foreground tabular-nums tracking-tight leading-none mb-2">
                    {formatted.value}
                  </div>
                )}

                {/* Subtitle */}
                {formatted && (
                  <p className="text-base text-muted-foreground">{formatted.subtitle}</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
