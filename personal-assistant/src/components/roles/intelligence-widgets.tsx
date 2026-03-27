'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Radar,
  HeartPulse,
  TrendingUp,
  Gauge,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { S, C } from '@/lib/styles/design-tokens'

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
// Style tokens
// ---------------------------------------------------------------------------

const widgetCard: React.CSSProperties = {
  padding: '16px',
  borderRadius: 12,
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.06))',
  transition: 'all 200ms',
}

const sectionHeader: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim, #475569)',
  marginBottom: 12,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WIDGET_DEFS = [
  {
    key: 'revenueRadar',
    label: 'Revenue Radar',
    icon: Radar,
    color: 'var(--text-primary, #F1F5F9)',
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
    icon: HeartPulse,
    color: '#22c55e',
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
    icon: TrendingUp,
    color: '#3b82f6',
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
    icon: Gauge,
    color: '#8b5cf6',
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

/**
 * Maps raw API responses from /api/intelligence/[metric] endpoints into the
 * IntelligenceData shape used by the widgets. Each response can be null
 * (fetch threw) or non-ok (endpoint error) -- failures are independent.
 */
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
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

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
      // Silently fail (matches existing codebase pattern)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchIntelligence()
    const interval = setInterval(fetchIntelligence, 60000) // refresh every 60s
    return () => clearInterval(interval)
  }, [fetchIntelligence])

  return (
    <div>
      <div style={sectionHeader}>Intelligence</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {WIDGET_DEFS.map(widget => {
          const widgetData = widget.extract(data)
          const Icon = widget.icon
          const isHovered = hoveredKey === widget.key
          const formatted = widgetData ? widget.format(widgetData) : null

          return (
            <div
              key={widget.key}
              onMouseEnter={() => setHoveredKey(widget.key)}
              onMouseLeave={() => setHoveredKey(null)}
              style={{
                ...widgetCard,
                border: isHovered
                  ? `1px solid ${C.borderHover}`
                  : `1px solid ${C.borderSubtle}`,
                background: isHovered
                  ? 'var(--bb-surface-hover, rgba(20, 28, 40, 0.7))'
                  : C.bgCard,
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: `${widget.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon size={13} style={{ color: widget.color }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary, #94A3B8)' }}>
                  {widget.label}
                </span>
                {formatted?.alert && (
                  <AlertTriangle size={11} style={{ color: '#eab308', marginLeft: 'auto' }} />
                )}
              </div>

              {/* Value */}
              {loading || !formatted ? (
                <div style={{
                  height: 28,
                  borderRadius: 8,
                  background: C.bgHover,
                  width: '50%',
                  marginBottom: 8,
                }} />
              ) : (
                <div style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: 'var(--text-primary, #F1F5F9)',
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  marginBottom: 8,
                }}>
                  {formatted.value}
                </div>
              )}

              {/* Subtitle */}
              {formatted && (
                <div style={{ fontSize: 14, color: 'var(--text-dim, #475569)' }}>
                  {formatted.subtitle}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
