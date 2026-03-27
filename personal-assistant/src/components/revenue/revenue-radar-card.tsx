'use client'

import { useEffect, useState } from 'react'
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, ArrowRight,
  RefreshCw, CheckCircle2, XCircle, Clock, Eye,
} from 'lucide-react'
import { S, C } from '@/lib/styles/design-tokens'

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

// ─── Styles ──────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  borderRadius: 12,
  background: 'var(--glass-bg)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--card-shadow), var(--card-inset)',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const bigNumber: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  fontFamily: 'var(--font-mono)',
  letterSpacing: '-0.03em',
  lineHeight: 1.1,
}

const insightRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '12px 12px',
  borderRadius: 8,
  background: C.bgHover,
  cursor: 'pointer',
  transition: 'background 150ms',
}

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'growing') return <TrendingUp size={14} color="#22C55E" />
  if (trend === 'declining' || trend === 'churned') return <TrendingDown size={14} color="#F59E0B" />
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
      // Trigger scoring and insight scan
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
      <div style={{ ...card, alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <RefreshCw size={20} color="var(--text-dim)" style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>Loading Revenue Radar...</span>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ ...card, alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>No revenue data available yet</span>
        <button
          onClick={handleRefresh}
          style={{
            background: 'var(--btn-primary-bg, #F1F5F9)',
            color: 'var(--btn-primary-fg, #0a0f1a)',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
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
      <div style={card}>
        <div className="flex items-center justify-between">
          <span style={sectionTitle}>Revenue Radar</span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: 'none',
              border: 'none',
              cursor: refreshing ? 'wait' : 'pointer',
              color: 'var(--text-dim)',
              padding: 4,
            }}
          >
            <RefreshCw size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>
        </div>

        {hasRecoverable ? (
          <div>
            <div style={{ fontSize: 14, color: 'var(--bb-amber)', fontWeight: 500, marginBottom: 4 }}>
              Recoverable Revenue
            </div>
            <div style={{ ...bigNumber, color: 'var(--text-primary, #F1F5F9)' }}>
              {fmt(data.recoverable_total_cents)}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 4 }}>
              from {data.insights.filter(i => ['unbilled_work', 'overdue_collection', 'scope_creep'].includes(i.insight_type)).length} actionable items
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={18} color="var(--bb-green)" />
            <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>
              No outstanding recoverable revenue
            </span>
          </div>
        )}
      </div>

      {/* ─── Cash Flow Prophet ─── */}
      {data.cash_flow && (
        <div style={card}>
          <span style={sectionTitle}>Cash Flow Prophet</span>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '30 days', cents: data.cash_flow.net_30d_cents },
              { label: '60 days', cents: data.cash_flow.net_60d_cents },
              { label: '90 days', cents: data.cash_flow.net_90d_cents },
            ].map(({ label, cents }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 4 }}>{label}</div>
                <div style={{
                  fontSize: 16,
                  fontWeight: 500,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '-0.02em',
                  color: cents >= 0 ? 'var(--bb-green)' : 'var(--bb-red)',
                }}>
                  {fmt(cents)}
                </div>
              </div>
            ))}
          </div>
          {data.cash_flow.confidence_low_30d_cents !== null && (
            <div style={{ fontSize: 14, color: 'var(--text-dim)', textAlign: 'center' }}>
              30d range: {fmt(data.cash_flow.confidence_low_30d_cents)} — {fmt(data.cash_flow.confidence_high_30d_cents ?? 0)}
            </div>
          )}
        </div>
      )}

      {/* ─── Active Insights ─── */}
      {data.insights.length > 0 && (
        <div style={card}>
          <div className="flex items-center justify-between">
            <span style={sectionTitle}>
              Active Insights ({data.insights.length})
            </span>
            {criticalInsights.length > 0 && (
              <span style={{ fontSize: 14, color: '#EF4444', fontWeight: 500 }}>
                {criticalInsights.length} urgent
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.insights.slice(0, 8).map(insight => (
              <div key={insight.id} style={insightRow}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: severityColors[insight.severity] ?? '#6B7280',
                  marginTop: 4,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                    {insight.title}
                  </div>
                  {insight.impact_cents && insight.impact_cents > 0 && (
                    <span style={{
                      fontSize: 14,
                      color: severityColors[insight.severity],
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {fmt(insight.impact_cents)}
                    </span>
                  )}
                  {insight.suggested_action && (
                    <div style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 2 }}>
                      {insight.suggested_action}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => handleInsightAction(insight.id, 'act')}
                    title="Act on this"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bb-green)', padding: 2 }}
                  >
                    <CheckCircle2 size={14} />
                  </button>
                  <button
                    onClick={() => handleInsightAction(insight.id, 'dismiss')}
                    title="Dismiss"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2 }}
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Top Clients ─── */}
      {data.top_clients.length > 0 && (
        <div style={card}>
          <span style={sectionTitle}>Top Clients by Revenue Score</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.top_clients.slice(0, 6).map((client, i) => (
              <div key={client.contact_id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                borderRadius: 8,
                background: i === 0 ? 'rgba(255, 255, 255, 0.04)' : C.bgHover,
              }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `${trendColors[client.trend] ?? '#3B82F6'}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 500,
                  color: trendColors[client.trend] ?? '#3B82F6',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {client.composite_score}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {client.contact_name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 1 }}>
                    <span style={{ fontSize: 14, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      {fmt(client.total_revenue_cents)}
                    </span>
                    <TrendIcon trend={client.trend} />
                    <span style={{ fontSize: 14, color: trendColors[client.trend], textTransform: 'capitalize' }}>
                      {client.trend}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  90d: {fmt(client.revenue_last_90d_cents)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Scope Alerts ─── */}
      {data.scope_alerts.length > 0 && (
        <div style={card}>
          <span style={sectionTitle}>Scope Creep Alerts</span>
          {data.scope_alerts.map(alert => (
            <div key={alert.project_name} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: C.statusWarningBg,
            }}>
              <AlertTriangle size={14} color="#F59E0B" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {alert.project_name}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>
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
