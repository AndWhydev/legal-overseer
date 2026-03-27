'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TabShell } from '@/components/ui/tab-shell'
import { EmptyState } from '@/components/ui/empty-state'
import {
  IconCurrencyDollar,
  IconUsers,
  IconTrendingDown,
  IconTrendingUp,
  IconCpu,
  IconAlertTriangle,
} from '@tabler/icons-react'
import type { CohortMatrix } from '@/app/api/analytics/cohorts/route'
import type { TrendsResponse, AnomalySummary } from '@/app/api/analytics/trends/route'
import type { TrendSeries, DataPoint, AnomalyPoint, ForecastPoint } from '@/lib/analytics/forecasting'
// Design token references replaced with Tailwind/CSS vars inline

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MRRData {
  totalMRR: number
  activeSubscriptions: number
  churnedThisMonth: number
  churnRate: number
  expansionRevenue: number
  netNewMRR: number
  byTier: Record<string, { count: number; mrr: number }>
}

interface AgentUsage {
  agentType: string
  inputTokens: number
  outputTokens: number
  invocations: number
  costUSD: number
}

interface ClientCost {
  clientName: string
  tokens: number
  costUSD: number
  actions: number
}

interface UsageData {
  totalTokens: number
  totalCostUSD: number
  byAgent: AgentUsage[]
  byClient: ClientCost[]
}

interface ChurnRisk {
  orgId: string
  orgName: string
  riskScore: number
  signals: Array<{ type: string; description: string }>
  plan: string
}

interface AnalyticsData {
  mrr: MRRData
  usage: UsageData | null
  churn: {
    atRiskOrgs: number
    risks: ChurnRisk[]
  }
}

// ---------------------------------------------------------------------------
// Style Constants
// ---------------------------------------------------------------------------

const glassCard: React.CSSProperties = {
  padding: 20,
  borderRadius: 16,
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05))',
}

const listRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 20px',
  borderRadius: 12,
  background: 'var(--glass-pill-bg)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--glass-card-inset)',
  border: 'none',
  transition: 'background 200ms',
}

const sectionHeader: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim)',
  marginBottom: 12,
}

const bigNumber: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  letterSpacing: '-0.03em',
  lineHeight: 1,
}

const badge = (color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 12px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '0.02em',
  background: `${color}15`,
  color: color,
})

const skeletonStyle: React.CSSProperties = {
  borderRadius: 8,
  background: `linear-gradient(90deg, ${'var(--border-subtle, rgba(255, 255, 255, 0.03))'} 25%, ${'var(--glass-border, rgba(255, 255, 255, 0.06))'} 50%, ${'var(--border-subtle, rgba(255, 255, 255, 0.03))'} 75%)`,
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease infinite',
}

// ---------------------------------------------------------------------------
// Retention heatmap colour scale  (0% → transparent, 100% → bright accent)
// ---------------------------------------------------------------------------

function retentionColor(pct: number): string {
  if (pct === 0) return 'var(--hover-bg, rgba(255, 255, 255, 0.04))'
  if (pct >= 80) return 'rgba(99,235,163,0.55)'
  if (pct >= 60) return 'rgba(99,235,163,0.35)'
  if (pct >= 40) return 'rgba(245,197,84,0.40)'
  if (pct >= 20) return 'rgba(245,197,84,0.22)'
  return 'rgba(245,107,84,0.22)'
}

// ---------------------------------------------------------------------------
// SVG line chart helper
// ---------------------------------------------------------------------------

interface LinePath {
  d: string
  color: string
  dashed?: boolean
}

function buildSVGPaths(
  points: Array<DataPoint | ForecastPoint | AnomalyPoint>,
  width: number,
  height: number,
  padding = 24,
): { paths: LinePath[]; scaleX: (i: number) => number; scaleY: (v: number) => number } {
  if (points.length < 2) return { paths: [], scaleX: () => 0, scaleY: () => 0 }

  const values = points.map((p) => p.value)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1

  const innerW = width - padding * 2
  const innerH = height - padding * 2

  const scaleX = (i: number) => padding + (i / (points.length - 1)) * innerW
  const scaleY = (v: number) => padding + innerH - ((v - minV) / range) * innerH

  // Solid line for real data, dashed for forecasts
  const solidPoints = points.filter((p) => !('forecast' in p) || !(p as ForecastPoint).forecast)
  const forecastPoints = points.filter((p) => ('forecast' in p) && (p as ForecastPoint).forecast)

  const solidIndices = solidPoints.map((p) => points.indexOf(p))
  const forecastIndices = forecastPoints.map((p) => points.indexOf(p))

  function buildD(indices: number[]) {
    return indices
      .map((i, k) => `${k === 0 ? 'M' : 'L'}${scaleX(i).toFixed(1)},${scaleY(points[i].value).toFixed(1)}`)
      .join(' ')
  }

  const paths: LinePath[] = []
  if (solidIndices.length >= 2) {
    paths.push({ d: buildD(solidIndices), color: 'rgba(99,180,235,0.85)' })
  }
  if (forecastIndices.length >= 2) {
    // Include last solid point so line is continuous
    const lastSolid = solidIndices[solidIndices.length - 1]
    const indices = lastSolid !== undefined ? [lastSolid, ...forecastIndices] : forecastIndices
    paths.push({ d: buildD(indices), color: 'rgba(99,180,235,0.45)', dashed: true })
  }

  return { paths, scaleX, scaleY }
}

// ---------------------------------------------------------------------------
// TrendChart component — inline SVG line chart with anomaly markers
// ---------------------------------------------------------------------------

function TrendChart({
  series,
  label,
  height = 120,
}: {
  series: TrendSeries
  label: string
  height?: number
}) {
  const width = 400
  const padding = 28

  // Combine real + forecast for the chart
  const allPoints: Array<DataPoint | ForecastPoint | AnomalyPoint> = [
    ...series.anomalies,
    ...series.forecast,
  ]

  const { paths, scaleX, scaleY } = useMemo(
    () => buildSVGPaths(allPoints, width, height, padding),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series],
  )

  const anomalyPoints = series.anomalies.filter((p) => p.isAnomaly)

  const trendColor =
    series.trend === 'up'
      ? 'var(--bb-green, #63eba3)'
      : series.trend === 'down'
        ? 'var(--bb-red, #f56b54)'
        : 'var(--text-dim)'

  return (
    <div style={{ ...glassCard, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: trendColor,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {series.trend === 'up' ? '▲' : series.trend === 'down' ? '▼' : '—'}{' '}
          {series.trendPct > 0 ? '+' : ''}{series.trendPct}%
        </span>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: 'visible', display: 'block' }}
        aria-label={`${label} trend chart`}
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padding + (1 - f) * (height - padding * 2)
          return (
            <line
              key={f}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke={'var(--glass-border, rgba(255, 255, 255, 0.06))'}
              strokeWidth={1}
            />
          )
        })}

        {/* Forecast band (upper/lower) */}
        {series.forecast.length >= 2 && (() => {
          const fPoints = series.forecast
          const upperD = fPoints
            .map((p, i) => {
              const xi = series.anomalies.length + i
              return `${i === 0 ? 'M' : 'L'}${scaleX(xi).toFixed(1)},${scaleY(p.upper ?? p.value).toFixed(1)}`
            })
            .join(' ')
          const lowerD = fPoints
            .map((p, i) => {
              const xi = series.anomalies.length + i
              return `${i === 0 ? 'M' : 'L'}${scaleX(xi).toFixed(1)},${scaleY(p.lower ?? p.value).toFixed(1)}`
            })
            .join(' ')
          const bandD = upperD + ' ' + lowerD.replace('M', 'L') + ' Z'
          return (
            <path
              d={bandD}
              fill="rgba(99,180,235,0.07)"
              stroke="none"
            />
          )
        })()}

        {/* Data + forecast paths */}
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={1.5}
            strokeDasharray={p.dashed ? '4,4' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Anomaly markers */}
        {anomalyPoints.map((p) => {
          const idx = series.anomalies.indexOf(p)
          const cx = scaleX(idx)
          const cy = scaleY(p.value)
          return (
            <g key={idx}>
              <circle
                cx={cx}
                cy={cy}
                r={5}
                fill="rgba(245,107,84,0.15)"
                stroke="rgba(245,107,84,0.8)"
                strokeWidth={1.5}
              />
              <circle cx={cx} cy={cy} r={2} fill="rgba(245,107,84,0.9)" />
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <LegendItem color="rgba(99,180,235,0.85)" label="Actual" />
        <LegendItem color="rgba(99,180,235,0.45)" label="Forecast" dashed />
        {anomalyPoints.length > 0 && (
          <LegendItem color="rgba(245,107,84,0.8)" label={`${anomalyPoints.length} anomaly`} circle />
        )}
      </div>
    </div>
  )
}

function LegendItem({
  color,
  label,
  dashed,
  circle,
}: {
  color: string
  label: string
  dashed?: boolean
  circle?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, color: 'var(--text-dim)' }}>
      {circle ? (
        <svg width={10} height={10} viewBox="0 0 10 10">
          <circle cx={5} cy={5} r={4} fill="none" stroke={color} strokeWidth={1.5} />
          <circle cx={5} cy={5} r={2} fill={color} />
        </svg>
      ) : (
        <svg width={16} height={6} viewBox="0 0 16 6">
          <line
            x1={0}
            y1={3}
            x2={16}
            y2={3}
            stroke={color}
            strokeWidth={2}
            strokeDasharray={dashed ? '3,3' : undefined}
          />
        </svg>
      )}
      {label}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Anomaly digest banner
// ---------------------------------------------------------------------------

const METRIC_LABELS: Record<string, string> = {
  messageVolume: 'Messages',
  taskCompletionRate: 'Tasks',
  agentInvocations: 'Agent Sessions',
}

function AnomalyDigest({ anomalies }: { anomalies: AnomalySummary[] }) {
  const top = anomalies.slice(0, 5)
  return (
    <div
      style={{
        borderRadius: 12,
        background: 'rgba(245,107,84,0.06)',
        border: '1px solid rgba(245,107,84,0.22)',
        padding: '12px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(245,107,84,0.9)' }}>
        {anomalies.length} anomaly{anomalies.length !== 1 ? 'ies' : ''} detected
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {top.map((a, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px',
              borderRadius: 8,
              background: 'rgba(245,107,84,0.10)',
              fontSize: 14,
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ color: 'rgba(245,107,84,0.85)', fontWeight: 500 }}>
              {a.zScore > 0 ? '+' : ''}{a.zScore}σ
            </span>
            <span>{METRIC_LABELS[a.metric] ?? a.metric}</span>
            <span style={{ color: 'var(--text-dim)' }}>{a.date}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Retention heatmap component
// ---------------------------------------------------------------------------

function CohortHeatmap({ matrix }: { matrix: CohortMatrix }) {
  if (matrix.cohorts.length === 0) {
    return (
      <div style={{ ...glassCard, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14, padding: 40 }}>
        Not enough data to compute cohort retention yet.
      </div>
    )
  }

  const weekHeaders = Array.from({ length: matrix.maxWeeks + 1 }, (_, i) =>
    i === 0 ? 'W0' : `W+${i}`,
  )

  return (
    <div style={{ ...glassCard, overflowX: 'auto' }}>
      <div style={{ minWidth: 500 }}>
        {/* Header row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `120px repeat(${weekHeaders.length}, 1fr)`,
            gap: 4,
            marginBottom: 4,
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 500, padding: '4px 0' }}>
            Cohort
          </div>
          {weekHeaders.map((w) => (
            <div
              key={w}
              style={{
                fontSize: 14,
                color: 'var(--text-dim)',
                textAlign: 'center',
                fontWeight: 500,
                padding: '4px 0',
              }}
            >
              {w}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {matrix.cohorts.map((cohort) => (
          <div
            key={cohort.cohortLabel}
            style={{
              display: 'grid',
              gridTemplateColumns: `120px repeat(${weekHeaders.length}, 1fr)`,
              gap: 4,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: 'var(--text-secondary)',
                padding: '8px 4px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <span style={{ fontWeight: 500 }}>{cohort.cohortLabel}</span>
              <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>
                {cohort.orgCount} org{cohort.orgCount !== 1 ? 's' : ''}
              </span>
            </div>
            {weekHeaders.map((_, wi) => {
              const pct = cohort.retention[wi] ?? null
              return (
                <div
                  key={wi}
                  title={pct !== null ? `${pct}%` : 'N/A'}
                  style={{
                    borderRadius: 8,
                    background: pct !== null ? retentionColor(pct) : 'var(--border-subtle, rgba(255, 255, 255, 0.03))',
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 500,
                    color: pct !== null && pct >= 40 ? 'var(--text-primary, #F1F5F9)' : 'var(--text-dim, rgba(255, 255, 255, 0.3))',
                    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  }}
                >
                  {pct !== null ? `${pct}%` : '—'}
                </div>
              )
            })}
          </div>
        ))}

        {/* Colour scale legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--glass-card-border)' }}>
          <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>Retention:</span>
          {[
            { pct: 0, label: '0%' },
            { pct: 25, label: '25%' },
            { pct: 50, label: '50%' },
            { pct: 75, label: '75%' },
            { pct: 100, label: '100%' },
          ].map(({ pct, label }) => (
            <div key={pct} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: retentionColor(pct),
                  border: `1px solid ${'var(--hover-bg-strong, rgba(255, 255, 255, 0.08))'}`,
                }}
              />
              <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [cohortData, setCohortData] = useState<CohortMatrix | null>(null)
  const [trendsData, setTrendsData] = useState<TrendsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [cohortLoading, setCohortLoading] = useState(true)
  const [trendsLoading, setTrendsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const client = createClient()
    if (!client) {
      setLoading(false)
      setError('Database not configured')
      return
    }

    // Fetch all three endpoints in parallel
    Promise.all([
      fetch('/api/analytics?type=all')
        .then((res) => {
          if (!res.ok) throw new Error(`${res.status}`)
          return res.json()
        })
        .then((d: AnalyticsData) => {
          setData(d)
          setLoading(false)
        })
        .catch((err) => {
          setError(String(err))
          setLoading(false)
        }),

      fetch('/api/analytics/cohorts')
        .then((res) => res.ok ? res.json() : null)
        .then((d: CohortMatrix | null) => {
          setCohortData(d)
          setCohortLoading(false)
        })
        .catch(() => setCohortLoading(false)),

      fetch('/api/analytics/trends')
        .then((res) => res.ok ? res.json() : null)
        .then((d: TrendsResponse | null) => {
          setTrendsData(d)
          setTrendsLoading(false)
        })
        .catch(() => setTrendsLoading(false)),
    ])
  }, [])

  if (loading) return <LoadingSkeleton />

  if (error || !data) {
    return (
      <TabShell>
        <EmptyState
          title="No analytics data available"
          description={error ? error : 'Connect billing to see MRR metrics, usage, and churn analysis.'}
        />
      </TabShell>
    )
  }

  const { mrr, usage, churn } = data

  return (
    <TabShell>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 32, color: 'var(--text-primary)' }}>

        {/* MRR Stats */}
        <section>
          <h3 style={sectionHeader}>Monthly Recurring Revenue</h3>
          <div className="bb-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
            <StatCard icon={IconCurrencyDollar} label="Total MRR" value={`$${mrr.totalMRR.toLocaleString()}`} />
            <StatCard icon={IconUsers} label="Active Subs" value={String(mrr.activeSubscriptions)} />
            <StatCard icon={IconTrendingDown} label="Churn Rate" value={`${mrr.churnRate}%`} alert={mrr.churnRate > 5} />
            <StatCard icon={IconTrendingUp} label="Net New MRR" value={`$${mrr.netNewMRR.toLocaleString()}`} />
          </div>

          {/* MRR by Tier */}
          <div style={{ ...glassCard, position: 'relative' }}>
            <h4 style={{ fontSize: 14, fontWeight: 500, marginBottom: 16, color: 'var(--text-primary)' }}>
              Revenue by Tier
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(mrr.byTier).map(([tier, info]) => {
                const pct = mrr.totalMRR > 0 ? (info.mrr / mrr.totalMRR) * 100 : 0
                return (
                  <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, minWidth: 80, textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                      {tier}
                    </span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--hover-bg-strong, rgba(255, 255, 255, 0.08))', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 4,
                          width: `${pct}%`,
                          background: 'var(--border-focus-ring, rgba(255, 255, 255, 0.2))',
                          transition: 'width 300ms ease',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 14, minWidth: 100, textAlign: 'right', color: 'var(--text-secondary)' }}>
                      ${info.mrr} ({info.count})
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Trend Forecasting */}
        <section>
          <h3 style={sectionHeader}>Activity Trends &amp; Forecasting</h3>
          {trendsLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ ...glassCard, position: 'relative' }}>
                  <div style={{ ...skeletonStyle, height: 14, width: '40%', marginBottom: 12 }} />
                  <div style={{ ...skeletonStyle, height: 120, width: '100%' }} />
                </div>
              ))}
            </div>
          ) : trendsData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Anomaly digest banner */}
              {trendsData.anomalies && trendsData.anomalies.length > 0 && (
                <AnomalyDigest anomalies={trendsData.anomalies} />
              )}
              <div className="bb-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                <TrendChart series={trendsData.messageVolume} label="Message Volume (30d)" />
                <TrendChart series={trendsData.taskCompletionRate} label="Tasks Completed (30d)" />
                <TrendChart series={trendsData.agentInvocations} label="Agent Sessions (30d)" />
              </div>
            </div>
          ) : (
            <div style={{ ...glassCard, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14, padding: 32 }}>
              Trend data unavailable
            </div>
          )}
        </section>

        {/* Cohort Retention */}
        <section>
          <h3 style={sectionHeader}>Cohort Retention</h3>
          <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 12, marginTop: -6 }}>
            Weekly cohorts — % of orgs still active N weeks after signup
          </p>
          {cohortLoading ? (
            <div style={{ ...glassCard, position: 'relative' }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ ...skeletonStyle, height: 32, marginBottom: 8 }} />
              ))}
            </div>
          ) : cohortData ? (
            <CohortHeatmap matrix={cohortData} />
          ) : (
            <div style={{ ...glassCard, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14, padding: 32 }}>
              Cohort data unavailable
            </div>
          )}
        </section>

        {/* Token Usage */}
        {usage && (
          <section>
            <h3 style={sectionHeader}>Token Usage &amp; Costs</h3>
            <div className="bb-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
              <StatCard icon={IconCpu} label="Total Tokens" value={formatTokens(usage.totalTokens)} />
              <StatCard icon={IconCurrencyDollar} label="Total Cost" value={`$${usage.totalCostUSD.toFixed(2)}`} />
            </div>

            {/* By Agent */}
            <div style={{ ...glassCard, position: 'relative', marginBottom: 16, overflowX: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 1fr',
                    gap: 16,
                    padding: '12px 0',
                    borderBottom: '1px solid var(--glass-interactive-border)',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)' }}>
                    Agent
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', textAlign: 'right' }}>
                    Invocations
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', textAlign: 'right' }}>
                    Tokens
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', textAlign: 'right' }}>
                    Cost
                  </div>
                </div>
                {usage.byAgent.map((a) => (
                  <div
                    key={a.agentType}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr 1fr',
                      gap: 16,
                      padding: '12px 0',
                      borderBottom: '1px solid var(--glass-card-border)',
                      fontSize: 14,
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div style={{ textTransform: 'capitalize' }}>{a.agentType.replace(/-/g, ' ')}</div>
                    <div style={{ textAlign: 'right' }}>{a.invocations}</div>
                    <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}>
                      {formatTokens(a.inputTokens + a.outputTokens)}
                    </div>
                    <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}>
                      ${a.costUSD.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By Client */}
            {usage.byClient.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 500, marginBottom: 12, color: 'var(--text-primary)' }}>
                  Cost per Client
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {usage.byClient
                    .sort((a, b) => b.costUSD - a.costUSD)
                    .slice(0, 10)
                    .map((c) => (
                      <div
                        key={c.clientName}
                        style={{
                          ...listRow,
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                          {c.clientName}
                        </span>
                        <span
                          style={{
                            fontSize: 14,
                            color: 'var(--text-secondary)',
                            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                          }}
                        >
                          ${c.costUSD.toFixed(2)} ({c.actions} actions)
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Churn Risk */}
        {churn && churn.risks.length > 0 && (
          <section>
            <h3 style={sectionHeader}>Churn Risk ({churn.atRiskOrgs} orgs)</h3>
            <div className="bb-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {churn.risks.map((r) => {
                const riskColor = r.riskScore >= 70 ? 'var(--bb-red)' : r.riskScore >= 50 ? 'var(--bb-amber)' : 'var(--bb-green)'
                return (
                  <div
                    key={r.orgId}
                    style={{
                      ...glassCard,
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <IconAlertTriangle
                        size={18}
                        style={{
                          color: riskColor,
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                            {r.orgName}
                          </span>
                          <span style={badge(riskColor)}>
                            Risk: {r.riskScore}
                          </span>
                        </div>
                        {r.signals.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {r.signals.map((s, idx) => (
                              <div
                                key={idx}
                                style={{
                                  fontSize: 14,
                                  color: 'var(--text-secondary)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                }}
                              >
                                <span
                                  style={{
                                    display: 'inline-block',
                                    width: 4,
                                    height: 4,
                                    borderRadius: '50%',
                                    background: 'var(--border-focus-ring, rgba(255, 255, 255, 0.2))',
                                    flexShrink: 0,
                                  }}
                                />
                                {s.description}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ROI Metrics */}
        <section>
          <h3 style={sectionHeader}>ROI Metrics</h3>
          <div className="bb-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <MetricCard
              label="Revenue per Sub"
              value={mrr.activeSubscriptions > 0 ? `$${Math.round(mrr.totalMRR / mrr.activeSubscriptions)}` : '$0'}
            />
            <MetricCard
              label="AI Cost per Sub"
              value={
                usage && mrr.activeSubscriptions > 0
                  ? `$${(usage.totalCostUSD / mrr.activeSubscriptions).toFixed(2)}`
                  : '$0'
              }
            />
            <MetricCard
              label="Gross Margin"
              value={
                usage && mrr.totalMRR > 0
                  ? `${Math.round(((mrr.totalMRR - usage.totalCostUSD) / mrr.totalMRR) * 100)}%`
                  : 'N/A'
              }
            />
          </div>
        </section>
      </div>
    </TabShell>
  )
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <TabShell>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* MRR Section Skeleton */}
        <section>
          <h3 style={sectionHeader}>Monthly Recurring Revenue</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ ...glassCard, position: 'relative' }}>
                <div style={{ ...skeletonStyle, height: 16, width: '60%', marginBottom: 12 }} />
                <div style={{ ...skeletonStyle, height: 36, width: '80%' }} />
              </div>
            ))}
          </div>
          <div style={{ ...glassCard, position: 'relative' }}>
            <div style={{ ...skeletonStyle, height: 16, width: '40%', marginBottom: 16 }} />
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ ...skeletonStyle, height: 20, width: '100%' }} />
              </div>
            ))}
          </div>
        </section>

        {/* Trends Skeleton */}
        <section>
          <h3 style={sectionHeader}>Activity Trends</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ ...glassCard, position: 'relative' }}>
                <div style={{ ...skeletonStyle, height: 14, width: '40%', marginBottom: 12 }} />
                <div style={{ ...skeletonStyle, height: 120, width: '100%' }} />
              </div>
            ))}
          </div>
        </section>

        {/* Cohort Skeleton */}
        <section>
          <h3 style={sectionHeader}>Cohort Retention</h3>
          <div style={{ ...glassCard, position: 'relative' }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ ...skeletonStyle, height: 32, marginBottom: 8 }} />
            ))}
          </div>
        </section>

        {/* Usage Section Skeleton */}
        <section>
          <h3 style={sectionHeader}>Token Usage &amp; Costs</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
            {[1, 2].map((i) => (
              <div key={i} style={{ ...glassCard, position: 'relative' }}>
                <div style={{ ...skeletonStyle, height: 16, width: '60%', marginBottom: 12 }} />
                <div style={{ ...skeletonStyle, height: 36, width: '80%' }} />
              </div>
            ))}
          </div>
          <div style={{ ...glassCard, position: 'relative' }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ ...skeletonStyle, height: 20, width: '100%' }} />
              </div>
            ))}
          </div>
        </section>

        {/* ROI Section Skeleton */}
        <section>
          <h3 style={sectionHeader}>ROI Metrics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ ...glassCard, position: 'relative' }}>
                <div style={{ ...skeletonStyle, height: 16, width: '60%', marginBottom: 12 }} />
                <div style={{ ...skeletonStyle, height: 28, width: '80%' }} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </TabShell>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function StatCard({
  icon: Icon,
  label,
  value,
  alert = false,
}: {
  icon: React.ElementType
  label: string
  value: string
  alert?: boolean
}) {
  return (
    <div
      className="bb-lift"
      style={{
        ...glassCard,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 14,
          color: 'var(--text-secondary)',
        }}
      >
        <Icon size={14} style={{ color: 'var(--text-dim)' }} />
        {label}
      </div>
      <div
        style={{
          ...bigNumber,
          color: alert ? 'var(--bb-red)' : 'var(--text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="bb-lift"
      style={{
        ...glassCard,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        }}
      >
        {value}
      </div>
    </div>
  )
}

export default React.memo(AnalyticsTab)
