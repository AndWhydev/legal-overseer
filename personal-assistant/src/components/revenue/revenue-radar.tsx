'use client'

import React from 'react'
import { useRevenueHealth, useRevenueInsights } from '@/hooks/use-revenue-data'
import { formatCents } from '@/lib/revenue/types'
import { RevenueInsightCard } from './insight-card'
import { CashFlowBar } from './cashflow-bar'
import { ClientLeaderboard } from './client-leaderboard'

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  padding: '0 4px',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 4,
}

const titleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary)',
  letterSpacing: '-0.02em',
}

const kpiRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 16,
}

const kpiCardStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderRadius: 'var(--radius-xl)',
  background: 'var(--bg-card)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const kpiLabelStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const kpiValueStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  fontFamily: 'var(--font-mono)',
  letterSpacing: '-0.03em',
  lineHeight: 1,
}

const kpiSubStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  opacity: 0.7,
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const emptyStateStyle: React.CSSProperties = {
  padding: '32px 24px',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: 14,
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-card)',
}

const loadingPulseStyle: React.CSSProperties = {
  height: 80,
  borderRadius: 'var(--radius-xl)',
  background: 'var(--bg-card)',
  animation: 'pulse 1.5s ease-in-out infinite',
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RevenueRadar() {
  const { data: health, loading: healthLoading } = useRevenueHealth()
  const { insights, totalAmountCents, loading: insightsLoading, updateStatus } = useRevenueInsights()

  const loading = healthLoading || insightsLoading

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>Revenue Radar</span>
        </div>
        <div style={kpiRowStyle}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={loadingPulseStyle} />
          ))}
        </div>
      </div>
    )
  }

  const snapshot = health?.snapshot
  const recoverable = health?.total_recoverable_cents ?? 0
  const overdue = health?.overdue_invoices_count ?? 0
  const collectionRate = health?.collection_rate_pct ?? 0
  const atRiskCount = health?.at_risk_clients?.length ?? 0

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={titleStyle}>Revenue Radar</span>
        {recoverable > 0 && (
          <span style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text-primary)',
            background: 'var(--bg-card)',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border)',
          }}>
            {formatCents(recoverable)} recoverable
          </span>
        )}
      </div>

      {/* KPI Row */}
      <div style={kpiRowStyle}>
        <div style={kpiCardStyle}>
          <span style={kpiLabelStyle}>Invoiced (Month)</span>
          <span style={{ ...kpiValueStyle, color: 'var(--bb-blue)' }}>
            {snapshot ? formatCents(snapshot.total_invoiced_cents) : '$0.00'}
          </span>
          <span style={kpiSubStyle}>
            {snapshot?.invoices_sent ?? 0} invoices sent
          </span>
        </div>

        <div style={kpiCardStyle}>
          <span style={kpiLabelStyle}>Collected</span>
          <span style={{ ...kpiValueStyle, color: 'var(--bb-green)' }}>
            {snapshot ? formatCents(snapshot.total_collected_cents) : '$0.00'}
          </span>
          <span style={kpiSubStyle}>
            {Math.round(collectionRate)}% collection rate
          </span>
        </div>

        <div style={kpiCardStyle}>
          <span style={kpiLabelStyle}>Outstanding</span>
          <span style={{ ...kpiValueStyle, color: 'var(--text-primary)' }}>
            {snapshot ? formatCents(snapshot.total_outstanding_cents) : '$0.00'}
          </span>
          <span style={kpiSubStyle}>
            {overdue} overdue
          </span>
        </div>

        <div style={kpiCardStyle}>
          <span style={kpiLabelStyle}>At Risk</span>
          <span style={{
            ...kpiValueStyle,
            color: atRiskCount > 0 ? 'var(--bb-red)' : 'var(--bb-green)',
          }}>
            {atRiskCount}
          </span>
          <span style={kpiSubStyle}>
            client{atRiskCount !== 1 ? 's' : ''} flagged
          </span>
        </div>
      </div>

      {/* Cash Flow Projections */}
      {(health?.cash_flow_30d || health?.cash_flow_60d || health?.cash_flow_90d) && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Cash Flow Projection</span>
          <CashFlowBar
            cf30={health?.cash_flow_30d ?? null}
            cf60={health?.cash_flow_60d ?? null}
            cf90={health?.cash_flow_90d ?? null}
          />
        </div>
      )}

      {/* Actionable Insights */}
      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>
          Action Items ({insights.length})
          {totalAmountCents > 0 && (
            <span style={{ fontWeight: 400, marginLeft: 8, fontSize: 14 }}>
              {formatCents(totalAmountCents)} total
            </span>
          )}
        </span>
        {insights.length === 0 ? (
          <div style={emptyStateStyle}>
            No active revenue insights. Revenue intelligence is running in the background.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {insights.slice(0, 8).map(insight => (
              <RevenueInsightCard
                key={insight.id}
                insight={insight}
                onAction={updateStatus}
              />
            ))}
          </div>
        )}
      </div>

      {/* Client Leaderboard */}
      {(health?.top_clients && health.top_clients.length > 0) && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Top Clients</span>
          <ClientLeaderboard
            clients={health.top_clients}
            atRisk={health.at_risk_clients ?? []}
          />
        </div>
      )}
    </div>
  )
}
