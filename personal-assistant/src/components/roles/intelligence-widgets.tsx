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
  borderRadius: 14,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  transition: 'all 200ms',
}

const sectionHeader: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim, #475569)',
  marginBottom: 14,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WIDGET_DEFS = [
  {
    key: 'revenueRadar',
    label: 'Revenue Radar',
    icon: Radar,
    color: '#FF5A1F',
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
      // Fetch bi_snapshots from the intelligence cron cache
      const res = await fetch('/api/roles/status')
      if (!res.ok) return

      // For now, use placeholder data structure
      // Intelligence data comes from bi_snapshots via the intelligence cron
      // This could be a dedicated API but status gives us role context
      setData({
        revenueRadar: { totalEstimatedValue: 0, opportunities: 0, clientsAnalyzed: 0, gatheringData: true },
        clientHealth: { averageScore: 0, clientsScored: 0, gatheringData: true },
        cashFlow: { currentNet: 0, alerts: 0, gatheringData: true },
        capacity: { utilizationPercent: 0, status: 'unknown', alerts: 0, gatheringData: true },
      })
    } catch {
      // Silently fail
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
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
                  ? '1px solid rgba(255, 255, 255, 0.1)'
                  : '1px solid rgba(255, 255, 255, 0.03)',
                background: isHovered
                  ? 'rgba(20, 28, 40, 0.7)'
                  : 'rgba(15, 20, 30, 0.6)',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
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
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary, #94A3B8)' }}>
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
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.04)',
                  width: '50%',
                  marginBottom: 6,
                }} />
              ) : (
                <div style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: 'var(--text-primary, #F1F5F9)',
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  marginBottom: 6,
                }}>
                  {formatted.value}
                </div>
              )}

              {/* Subtitle */}
              {formatted && (
                <div style={{ fontSize: 11, color: 'var(--text-dim, #475569)' }}>
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
