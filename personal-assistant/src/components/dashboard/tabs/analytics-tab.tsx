'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TabShell } from '@/components/ui/tab-shell'
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
// Retention heatmap colour scale
// ---------------------------------------------------------------------------

function retentionColor(pct: number): string {
  if (pct === 0) return 'hsl(var(--muted))'
  if (pct >= 80) return 'hsl(142 71% 65% / 0.55)'
  if (pct >= 60) return 'hsl(142 71% 65% / 0.35)'
  if (pct >= 40) return 'hsl(43 96% 65% / 0.40)'
  if (pct >= 20) return 'hsl(43 96% 65% / 0.22)'
  return 'hsl(6 85% 65% / 0.22)'
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
    paths.push({ d: buildD(solidIndices), color: 'hsl(var(--primary))' })
  }
  if (forecastIndices.length >= 2) {
    const lastSolid = solidIndices[solidIndices.length - 1]
    const indices = lastSolid !== undefined ? [lastSolid, ...forecastIndices] : forecastIndices
    paths.push({ d: buildD(indices), color: 'hsl(var(--primary) / 0.45)', dashed: true })
  }

  return { paths, scaleX, scaleY }
}

// ---------------------------------------------------------------------------
// TrendChart component
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{label}</CardTitle>
          <Badge
            variant={series.trend === 'up' ? 'secondary' : series.trend === 'down' ? 'destructive' : 'outline'}
          >
            {series.trend === 'up' ? (
              <IconTrendingUp className="mr-1 size-3" />
            ) : series.trend === 'down' ? (
              <IconTrendingDown className="mr-1 size-3" />
            ) : null}
            {series.trendPct > 0 ? '+' : ''}{series.trendPct}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <svg
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
          className="block overflow-visible"
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
                stroke="hsl(var(--border))"
                strokeWidth={1}
              />
            )
          })}

          {/* Forecast band */}
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
                fill="hsl(var(--primary) / 0.07)"
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
                  fill="hsl(var(--destructive) / 0.15)"
                  stroke="hsl(var(--destructive) / 0.8)"
                  strokeWidth={1.5}
                />
                <circle cx={cx} cy={cy} r={2} fill="hsl(var(--destructive) / 0.9)" />
              </g>
            )
          })}
        </svg>

        {/* Legend */}
        <div className="mt-2 flex gap-4">
          <LegendItem color="hsl(var(--primary))" label="Actual" />
          <LegendItem color="hsl(var(--primary) / 0.45)" label="Forecast" dashed />
          {anomalyPoints.length > 0 && (
            <LegendItem color="hsl(var(--destructive) / 0.8)" label={`${anomalyPoints.length} anomaly`} circle />
          )}
        </div>
      </CardContent>
    </Card>
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
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
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
    <Card className="border-destructive/20 bg-destructive/5">
      <CardContent className="flex flex-col gap-2 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
          <IconAlertTriangle className="size-4" />
          {anomalies.length} anomal{anomalies.length !== 1 ? 'ies' : 'y'} detected
        </div>
        <div className="flex flex-wrap gap-2">
          {top.map((a, i) => (
            <Badge key={i} variant="destructive" className="gap-1.5">
              <span className="font-medium">
                {a.zScore > 0 ? '+' : ''}{a.zScore}s
              </span>
              <span>{METRIC_LABELS[a.metric] ?? a.metric}</span>
              <span className="text-destructive-foreground/60">{a.date}</span>
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Retention heatmap component
// ---------------------------------------------------------------------------

function CohortHeatmap({ matrix }: { matrix: CohortMatrix }) {
  if (matrix.cohorts.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Not enough data to compute cohort retention yet.
        </CardContent>
      </Card>
    )
  }

  const weekHeaders = Array.from({ length: matrix.maxWeeks + 1 }, (_, i) =>
    i === 0 ? 'W0' : `W+${i}`,
  )

  return (
    <Card>
      <CardContent className="overflow-x-auto">
        <div className="min-w-[500px]">
          {/* Header row */}
          <div
            className="mb-1 grid gap-1"
            style={{ gridTemplateColumns: `120px repeat(${weekHeaders.length}, 1fr)` }}
          >
            <div className="py-1 text-xs font-medium text-muted-foreground">
              Cohort
            </div>
            {weekHeaders.map((w) => (
              <div
                key={w}
                className="py-1 text-center text-xs font-medium text-muted-foreground"
              >
                {w}
              </div>
            ))}
          </div>

          {/* Data rows */}
          {matrix.cohorts.map((cohort) => (
            <div
              key={cohort.cohortLabel}
              className="mb-1 grid gap-1"
              style={{ gridTemplateColumns: `120px repeat(${weekHeaders.length}, 1fr)` }}
            >
              <div className="flex flex-col gap-0.5 px-1 py-2">
                <span className="text-sm font-medium text-foreground">{cohort.cohortLabel}</span>
                <span className="text-xs text-muted-foreground">
                  {cohort.orgCount} org{cohort.orgCount !== 1 ? 's' : ''}
                </span>
              </div>
              {weekHeaders.map((_, wi) => {
                const pct = cohort.retention[wi] ?? null
                return (
                  <div
                    key={wi}
                    title={pct !== null ? `${pct}%` : 'N/A'}
                    className="flex h-8 items-center justify-center rounded-md font-mono text-xs font-medium"
                    style={{
                      backgroundColor: pct !== null ? retentionColor(pct) : undefined,
                      color: pct !== null && pct >= 40 ? 'hsl(var(--foreground))' : undefined,
                    }}
                  >
                    {pct !== null ? (
                      <span className={pct < 40 ? 'text-muted-foreground' : ''}>{pct}%</span>
                    ) : (
                      <span className="text-muted-foreground/50">&mdash;</span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          {/* Colour scale legend */}
          <div className="mt-3 flex items-center gap-2 border-t pt-3">
            <span className="text-xs text-muted-foreground">Retention:</span>
            {[
              { pct: 0, label: '0%' },
              { pct: 25, label: '25%' },
              { pct: 50, label: '50%' },
              { pct: 75, label: '75%' },
              { pct: 100, label: '100%' },
            ].map(({ pct, label }) => (
              <div key={pct} className="flex items-center gap-1">
                <div
                  className="size-4 rounded border"
                  style={{ backgroundColor: retentionColor(pct) }}
                />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
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
        <Empty>
          <EmptyTitle>No analytics data available</EmptyTitle>
          <EmptyDescription>{error ? error : 'Connect billing to see MRR metrics, usage, and churn analysis.'}</EmptyDescription>
        </Empty>
      </TabShell>
    )
  }

  const { mrr, usage, churn } = data

  return (
    <TabShell>
      <div className="flex flex-col gap-8 p-6 text-foreground">

        {/* MRR Stats */}
        <section className="flex flex-col gap-4">
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Monthly Recurring Revenue
          </h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <StatCard icon={IconCurrencyDollar} label="Total MRR" value={`$${mrr.totalMRR.toLocaleString()}`} />
            <StatCard icon={IconUsers} label="Active Subs" value={String(mrr.activeSubscriptions)} />
            <StatCard icon={IconTrendingDown} label="Churn Rate" value={`${mrr.churnRate}%`} alert={mrr.churnRate > 5} />
            <StatCard icon={IconTrendingUp} label="Net New MRR" value={`$${mrr.netNewMRR.toLocaleString()}`} />
          </div>

          {/* MRR by Tier */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Revenue by Tier</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {Object.entries(mrr.byTier).map(([tier, info]) => {
                const pct = mrr.totalMRR > 0 ? (info.mrr / mrr.totalMRR) * 100 : 0
                return (
                  <div key={tier} className="flex items-center gap-3">
                    <span className="min-w-20 text-sm capitalize text-foreground">
                      {tier}
                    </span>
                    <Progress value={pct} className="h-2 flex-1" />
                    <span className="min-w-24 text-right text-sm text-muted-foreground">
                      ${info.mrr} ({info.count})
                    </span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </section>

        {/* Trend Forecasting */}
        <section className="flex flex-col gap-4">
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Activity Trends &amp; Forecasting
          </h3>
          {trendsLoading ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="space-y-3 pt-4">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-[120px] w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : trendsData ? (
            <div className="flex flex-col gap-4">
              {trendsData.anomalies && trendsData.anomalies.length > 0 && (
                <AnomalyDigest anomalies={trendsData.anomalies} />
              )}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
                <TrendChart series={trendsData.messageVolume} label="Message Volume (30d)" />
                <TrendChart series={trendsData.taskCompletionRate} label="Tasks Completed (30d)" />
                <TrendChart series={trendsData.agentInvocations} label="Agent Sessions (30d)" />
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Trend data unavailable
              </CardContent>
            </Card>
          )}
        </section>

        {/* Cohort Retention */}
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Cohort Retention
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Weekly cohorts -- % of orgs still active N weeks after signup
            </p>
          </div>
          {cohortLoading ? (
            <Card>
              <CardContent className="space-y-2 pt-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : cohortData ? (
            <CohortHeatmap matrix={cohortData} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Cohort data unavailable
              </CardContent>
            </Card>
          )}
        </section>

        {/* Token Usage */}
        {usage && (
          <section className="flex flex-col gap-4">
            <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Token Usage &amp; Costs
            </h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <StatCard icon={IconCpu} label="Total Tokens" value={formatTokens(usage.totalTokens)} />
              <StatCard icon={IconCurrencyDollar} label="Total Cost" value={`$${usage.totalCostUSD.toFixed(2)}`} />
            </div>

            {/* By Agent */}
            <Card>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-right">Invocations</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usage.byAgent.map((a) => (
                      <TableRow key={a.agentType}>
                        <TableCell className="capitalize">{a.agentType.replace(/-/g, ' ')}</TableCell>
                        <TableCell className="text-right">{a.invocations}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatTokens(a.inputTokens + a.outputTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${a.costUSD.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* By Client */}
            {usage.byClient.length > 0 && (
              <div className="flex flex-col gap-3">
                <h4 className="text-sm font-medium text-foreground">
                  Cost per Client
                </h4>
                <div className="flex flex-col gap-2">
                  {usage.byClient
                    .sort((a, b) => b.costUSD - a.costUSD)
                    .slice(0, 10)
                    .map((c) => (
                      <Card key={c.clientName} size="sm">
                        <CardContent className="flex items-center justify-between">
                          <span className="text-sm text-foreground">
                            {c.clientName}
                          </span>
                          <span className="font-mono text-sm text-muted-foreground">
                            ${c.costUSD.toFixed(2)} ({c.actions} actions)
                          </span>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Churn Risk */}
        {churn && churn.risks.length > 0 && (
          <section className="flex flex-col gap-4">
            <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Churn Risk ({churn.atRiskOrgs} orgs)
            </h3>
            <div className="flex flex-col gap-3">
              {churn.risks.map((r) => (
                <Card key={r.orgId}>
                  <CardContent className="flex gap-3 pt-4">
                    <IconAlertTriangle
                      className={`mt-0.5 size-4.5 shrink-0 ${
                        r.riskScore >= 70 ? 'text-destructive' :
                        r.riskScore >= 50 ? 'text-amber-500' : 'text-emerald-500'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {r.orgName}
                        </span>
                        <Badge
                          variant={r.riskScore >= 70 ? 'destructive' : r.riskScore >= 50 ? 'secondary' : 'outline'}
                        >
                          Risk: {r.riskScore}
                        </Badge>
                      </div>
                      {r.signals.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {r.signals.map((s, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 text-sm text-muted-foreground"
                            >
                              <span className="inline-block size-1 shrink-0 rounded-full bg-border" />
                              {s.description}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* ROI Metrics */}
        <section className="flex flex-col gap-4">
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            ROI Metrics
          </h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
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
      <div className="flex flex-col gap-8 p-6">
        {/* MRR */}
        <section className="flex flex-col gap-4">
          <Skeleton className="h-3 w-48" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-3 pt-4">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-9 w-4/5" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="space-y-3 pt-4">
              <Skeleton className="h-4 w-2/5" />
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </CardContent>
          </Card>
        </section>

        {/* Trends */}
        <section className="flex flex-col gap-4">
          <Skeleton className="h-3 w-36" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-3 pt-4">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-[120px] w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Cohort */}
        <section className="flex flex-col gap-4">
          <Skeleton className="h-3 w-32" />
          <Card>
            <CardContent className="space-y-2 pt-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </CardContent>
          </Card>
        </section>

        {/* Usage */}
        <section className="flex flex-col gap-4">
          <Skeleton className="h-3 w-40" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-3 pt-4">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-9 w-4/5" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="space-y-3 pt-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </CardContent>
          </Card>
        </section>

        {/* ROI */}
        <section className="flex flex-col gap-4">
          <Skeleton className="h-3 w-24" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-3 pt-4">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-7 w-4/5" />
                </CardContent>
              </Card>
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
    <Card>
      <CardContent className="flex flex-col gap-2 pt-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </div>
        <div className={`font-mono text-base font-medium leading-none tracking-tight ${
          alert ? 'text-destructive' : 'text-foreground'
        }`}>
          {value}
        </div>
      </CardContent>
    </Card>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 pt-4 text-center">
        <div className="text-sm text-muted-foreground">
          {label}
        </div>
        <div className="font-mono text-base font-medium text-foreground">
          {value}
        </div>
      </CardContent>
    </Card>
  )
}

export default React.memo(AnalyticsTab)
