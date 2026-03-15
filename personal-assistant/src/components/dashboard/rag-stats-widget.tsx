'use client'

import { useEffect, useState } from 'react'
import { Database, AlertCircle, Loader2, DollarSign, AlertTriangle } from 'lucide-react'
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
    <span style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', fontWeight: 700 }}>
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

        // Fallback to legacy stats endpoint if monitoring data is empty
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

  const glassCard: React.CSSProperties = {
    padding: '16px',
    borderRadius: 12,
    background: 'rgba(15, 20, 30, 0.6)',
    backdropFilter: 'blur(20px) saturate(1.2)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
    border: '1px solid rgba(255, 255, 255, 0.03)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  }

  const metricRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  }

  const metricLabel: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--text-secondary, #94A3B8)',
    fontWeight: 500,
  }

  const metricValue: React.CSSProperties = {
    fontSize: 16,
    color: 'var(--text-primary, #F1F5F9)',
    fontWeight: 600,
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  }

  const titleStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary, #F1F5F9)',
    margin: 0,
  }

  if (error) {
    return (
      <div
        style={{
          ...glassCard,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          ...{ className },
        }}
      >
        <AlertCircle size={16} style={{ color: '#EF4444', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#EF4444' }}>{error}</span>
      </div>
    )
  }

  if (loading || !stats) {
    return (
      <div style={{ ...glassCard, display: 'flex', alignItems: 'center', gap: 8, ...{ className } }}>
        <Loader2
          size={16}
          style={{
            color: 'var(--text-secondary)',
            animation: 'bb-spin 1s linear infinite',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading vector stats...</span>
      </div>
    )
  }

  // Get top channels by vector count
  const topChannels = Object.entries(stats.namespaceVectors)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .slice(0, 5)

  return (
    <div style={{ ...glassCard, className }} className={className}>
      <div style={headerStyle}>
        <Database size={16} style={{ color: '#FF5A1F' }} />
        <h3 style={titleStyle}>Vector Index</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Total vectors card */}
        <div style={metricRow}>
          <span style={metricLabel}>Total Vectors</span>
          <span style={metricValue}>
            {loading ? '–' : <CountUp target={stats.totalVectors} />}
          </span>
        </div>

        {/* Index fullness */}
        <div style={metricRow}>
          <span style={metricLabel}>Index Capacity</span>
          <span style={metricValue}>
            {loading ? '–' : <CountUp target={stats.indexFullness} suffix="%" />}
          </span>
        </div>

        {/* Show details if enabled and we have channel breakdown */}
        {showDetails && topChannels.length > 0 && (
          <>
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-dim, #475569)', fontWeight: 600, marginBottom: 6 }}>
              TOP CHANNELS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topChannels.map(([channel, count]) => (
                <div key={channel} style={metricRow}>
                  <span style={{ ...metricLabel, fontSize: 11, color: 'var(--text-secondary)' }}>
                    {channel}
                  </span>
                  <span
                    style={{
                      ...metricValue,
                      fontSize: 12,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {(count ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Last updated timestamp */}
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-dim, #475569)',
            marginTop: 8,
            textAlign: 'right',
          }}
        >
          {new Date(stats.lastUpdated).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}
