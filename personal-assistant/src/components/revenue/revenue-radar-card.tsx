'use client'

import { useEffect, useState } from 'react'
import {
  IconCurrencyDollar, IconTrendingUp, IconTrendingDown, IconAlertTriangle, IconArrowRight,
  IconRefresh, IconCircleCheck, IconCircleX, IconClock, IconEye,
} from '@tabler/icons-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Insight {
  id: string
  insight_type: string
  severity: string
  title: string
  description: string
  impact_cents: number | null
  contact_id: string | null
  suggested_action: string | null
  status: string
  created_at: string
  contacts?: { name: string } | null
}

interface ClientScore {
  contact_id: string
  contact_name: string
  composite_score: number
  trend: string
  total_revenue_cents: number
  revenue_last_90d_cents: number
  monthly_growth_rate: number | null
}

interface CashFlow {
  inflow_30d_cents: number
  inflow_60d_cents: number
  inflow_90d_cents: number
  net_30d_cents: number
  net_60d_cents: number
  net_90d_cents: number
  confidence_low_30d_cents: number | null
  confidence_high_30d_cents: number | null
}

interface RadarData {
  recoverable_total_cents: number
  insights: Insight[]
  top_clients: ClientScore[]
  cash_flow: CashFlow | null
  scope_alerts: Array<{
    project_name: string
    scope_creep_pct: number
    unbilled_value_cents: number
  }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const severityColors: Record<string, string> = {
  critical: '#EF4444',
  high: '#F59E0B',
  medium: '#3B82F6',
  low: '#8B5CF6',
  info: '#6B7280',
}

const trendColors: Record<string, string> = {
  growing: '#22C55E',
  stable: '#3B82F6',
  declining: '#F59E0B',
  churned: '#EF4444',
  new: '#8B5CF6',
}

function fmt(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'growing') return <IconTrendingUp size={14} className="text-green-500" />
  if (trend === 'declining' || trend === 'churned') return <IconTrendingDown size={14} className="text-amber-500" />
  return null
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RevenueRadarCard() {
  const [data, setData] = useState<RadarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchRadar = async () => {
    try {
      const res = await fetch('/api/revenue/radar')
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => { fetchRadar() }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        fetch('/api/revenue/scores', { method: 'POST' }),
        fetch('/api/revenue/cash-flow', { method: 'POST' }),
        fetch('/api/revenue/insights', { method: 'POST' }),
      ])
      await fetchRadar()
    } catch { /* silent */ }
    setRefreshing(false)
  }

  const handleInsightAction = async (insightId: string, action: 'acknowledge' | 'act' | 'dismiss') => {
    try {
      await fetch('/api/revenue/insights', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insight_id: insightId, action }),
      })
      await fetchRadar()
    } catch { /* silent */ }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-card backdrop-blur-lg shadow-sm p-5 min-h-[200px]">
        <IconRefresh size={20} className="text-muted-foreground animate-spin" />
        <span className="text-sm text-muted-foreground">Loading Revenue Radar...</span>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-card backdrop-blur-lg shadow-sm p-5 min-h-[200px]">
        <span className="text-sm text-muted-foreground">No revenue data available yet</span>
        <button
          onClick={handleRefresh}
          className="bg-primary text-primary-foreground border-none rounded-lg px-4 py-2 text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity"
        >
          Generate Revenue Scores
        </button>
      </div>
    )
  }

  const hasRecoverable = data.recoverable_total_cents > 0
  const criticalInsights = data.insights.filter(i => i.severity === 'critical' || i.severity === 'high')

  return (
    <div className="flex flex-col gap-4">
      {/* ─── Hero: Recoverable Revenue ─── */}
      <div className="flex flex-col gap-3 rounded-xl bg-card backdrop-blur-lg shadow-sm p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue Radar</span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-transparent border-none cursor-pointer text-muted-foreground p-1 disabled:cursor-wait"
          >
            <IconRefresh size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {hasRecoverable ? (
          <div>
            <div className="text-sm text-amber-500 font-medium mb-1">
              Recoverable Revenue
            </div>
            <div className="text-base font-medium font-mono tracking-tight text-foreground leading-none">
              {fmt(data.recoverable_total_cents)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              from {data.insights.filter(i => ['unbilled_work', 'overdue_collection', 'scope_creep'].includes(i.insight_type)).length} actionable items
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <IconCircleCheck size={18} className="text-green-500" />
            <span className="text-sm text-foreground">
              No outstanding recoverable revenue
            </span>
          </div>
        )}
      </div>

      {/* ─── Cash Flow Prophet ─── */}
      {data.cash_flow && (
        <div className="flex flex-col gap-3 rounded-xl bg-card backdrop-blur-lg shadow-sm p-5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cash Flow Prophet</span>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '30 days', cents: data.cash_flow.net_30d_cents },
              { label: '60 days', cents: data.cash_flow.net_60d_cents },
              { label: '90 days', cents: data.cash_flow.net_90d_cents },
            ].map(({ label, cents }) => (
              <div key={label} className="text-center">
                <div className="text-sm text-muted-foreground mb-1">{label}</div>
                <div className={`text-base font-medium font-mono tracking-tight ${cents >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {fmt(cents)}
                </div>
              </div>
            ))}
          </div>
          {data.cash_flow.confidence_low_30d_cents !== null && (
            <div className="text-sm text-muted-foreground text-center">
              30d range: {fmt(data.cash_flow.confidence_low_30d_cents)} — {fmt(data.cash_flow.confidence_high_30d_cents ?? 0)}
            </div>
          )}
        </div>
      )}

      {/* ─── Active Insights ─── */}
      {data.insights.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl bg-card backdrop-blur-lg shadow-sm p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Active Insights ({data.insights.length})
            </span>
            {criticalInsights.length > 0 && (
              <span className="text-sm text-red-500 font-medium">
                {criticalInsights.length} urgent
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {data.insights.slice(0, 8).map(insight => (
              <div key={insight.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 cursor-pointer transition-colors hover:bg-muted">
                <div
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: severityColors[insight.severity] ?? '#6B7280' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground font-medium">
                    {insight.title}
                  </div>
                  {insight.impact_cents && insight.impact_cents > 0 && (
                    <span
                      className="text-sm font-mono"
                      style={{ color: severityColors[insight.severity] }}
                    >
                      {fmt(insight.impact_cents)}
                    </span>
                  )}
                  {insight.suggested_action && (
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {insight.suggested_action}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleInsightAction(insight.id, 'act')}
                    title="Act on this"
                    className="bg-transparent border-none cursor-pointer text-green-500 p-0.5"
                  >
                    <IconCircleCheck size={14} />
                  </button>
                  <button
                    onClick={() => handleInsightAction(insight.id, 'dismiss')}
                    title="Dismiss"
                    className="bg-transparent border-none cursor-pointer text-muted-foreground p-0.5"
                  >
                    <IconCircleX size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Top Clients ─── */}
      {data.top_clients.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl bg-card backdrop-blur-lg shadow-sm p-5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Top Clients by Revenue Score</span>
          <div className="flex flex-col gap-2">
            {data.top_clients.slice(0, 6).map((client, i) => (
              <div key={client.contact_id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${i === 0 ? 'bg-white/[0.04]' : 'bg-muted/50'}`}>
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-medium font-mono"
                  style={{
                    background: `${trendColors[client.trend] ?? '#3B82F6'}20`,
                    color: trendColors[client.trend] ?? '#3B82F6',
                  }}
                >
                  {client.composite_score}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {client.contact_name}
                  </div>
                  <div className="flex items-center gap-2 mt-px">
                    <span className="text-sm text-muted-foreground font-mono">
                      {fmt(client.total_revenue_cents)}
                    </span>
                    <TrendIcon trend={client.trend} />
                    <span className="text-sm capitalize" style={{ color: trendColors[client.trend] }}>
                      {client.trend}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground font-mono">
                  90d: {fmt(client.revenue_last_90d_cents)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Scope Alerts ─── */}
      {data.scope_alerts.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl bg-card backdrop-blur-lg shadow-sm p-5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scope Creep Alerts</span>
          {data.scope_alerts.map(alert => (
            <div key={alert.project_name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10">
              <IconAlertTriangle size={14} className="text-amber-500" />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">
                  {alert.project_name}
                </div>
                <div className="text-sm text-muted-foreground">
                  +{Math.round(alert.scope_creep_pct)}% scope • {fmt(alert.unbilled_value_cents)} unbilled
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
