'use client'

import React from 'react'
import { useRevenueHealth, useRevenueInsights } from '@/hooks/use-revenue-data'
import { formatCents } from '@/lib/revenue/types'
import { RevenueInsightCard } from './insight-card'
import { CashFlowBar } from './cashflow-bar'
import { ClientLeaderboard } from './client-leaderboard'

// ─── Component ──────────────────────────────────────────────────────────────

export function RevenueRadar() {
  const { data: health, loading: healthLoading } = useRevenueHealth()
  const { insights, totalAmountCents, loading: insightsLoading, updateStatus } = useRevenueInsights()

  const loading = healthLoading || insightsLoading

  if (loading) {
    return (
      <div className="flex flex-col gap-6 px-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-base font-medium text-[var(--text-primary)] tracking-tight">Revenue Radar</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 rounded-[var(--radius-xl)] bg-[var(--bg-card)] animate-pulse" />
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
    <div className="flex flex-col gap-6 px-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-base font-medium text-[var(--text-primary)] tracking-tight">Revenue Radar</span>
        {recoverable > 0 && (
          <span className="text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-card)] px-3 py-1 rounded-full border border-[var(--border)]">
            {formatCents(recoverable)} recoverable
          </span>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <div className="flex flex-col gap-2 px-5 py-4 rounded-[var(--radius-xl)] bg-[var(--bg-card)]">
          <span className="text-sm text-[var(--text-secondary)] uppercase tracking-wide">Invoiced (Month)</span>
          <span className="text-base font-medium font-mono tracking-tight leading-none text-[var(--bb-blue)]">
            {snapshot ? formatCents(snapshot.total_invoiced_cents) : '$0.00'}
          </span>
          <span className="text-sm text-[var(--text-secondary)] opacity-70">
            {snapshot?.invoices_sent ?? 0} invoices sent
          </span>
        </div>

        <div className="flex flex-col gap-2 px-5 py-4 rounded-[var(--radius-xl)] bg-[var(--bg-card)]">
          <span className="text-sm text-[var(--text-secondary)] uppercase tracking-wide">Collected</span>
          <span className="text-base font-medium font-mono tracking-tight leading-none text-[var(--bb-green)]">
            {snapshot ? formatCents(snapshot.total_collected_cents) : '$0.00'}
          </span>
          <span className="text-sm text-[var(--text-secondary)] opacity-70">
            {Math.round(collectionRate)}% collection rate
          </span>
        </div>

        <div className="flex flex-col gap-2 px-5 py-4 rounded-[var(--radius-xl)] bg-[var(--bg-card)]">
          <span className="text-sm text-[var(--text-secondary)] uppercase tracking-wide">Outstanding</span>
          <span className="text-base font-medium font-mono tracking-tight leading-none text-[var(--text-primary)]">
            {snapshot ? formatCents(snapshot.total_outstanding_cents) : '$0.00'}
          </span>
          <span className="text-sm text-[var(--text-secondary)] opacity-70">
            {overdue} overdue
          </span>
        </div>

        <div className="flex flex-col gap-2 px-5 py-4 rounded-[var(--radius-xl)] bg-[var(--bg-card)]">
          <span className="text-sm text-[var(--text-secondary)] uppercase tracking-wide">At Risk</span>
          <span
            className="text-base font-medium font-mono tracking-tight leading-none"
            style={{ color: atRiskCount > 0 ? 'var(--bb-red)' : 'var(--bb-green)' }}
          >
            {atRiskCount}
          </span>
          <span className="text-sm text-[var(--text-secondary)] opacity-70">
            client{atRiskCount !== 1 ? 's' : ''} flagged
          </span>
        </div>
      </div>

      {/* Cash Flow Projections */}
      {(health?.cash_flow_30d || health?.cash_flow_60d || health?.cash_flow_90d) && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wide">Cash Flow Projection</span>
          <CashFlowBar
            cf30={health?.cash_flow_30d ?? null}
            cf60={health?.cash_flow_60d ?? null}
            cf90={health?.cash_flow_90d ?? null}
          />
        </div>
      )}

      {/* Actionable Insights */}
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          Action Items ({insights.length})
          {totalAmountCents > 0 && (
            <span className="font-normal ml-2 text-sm">
              {formatCents(totalAmountCents)} total
            </span>
          )}
        </span>
        {insights.length === 0 ? (
          <div className="px-6 py-8 text-center text-[var(--text-secondary)] text-sm rounded-[var(--radius-lg)] bg-[var(--bg-card)]">
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
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wide">Top Clients</span>
          <ClientLeaderboard
            clients={health.top_clients}
            atRisk={health.at_risk_clients ?? []}
          />
        </div>
      )}
    </div>
  )
}
