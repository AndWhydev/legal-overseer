'use client'

import React, { useState } from 'react'
import type { RevenueInsight, InsightType, InsightSeverity } from '@/lib/revenue/types'
import { formatCents } from '@/lib/revenue/types'
import { Badge } from '@/components/ui/badge'

// ─── Severity + Type Config ─────────────────────────────────────────────────

const SEVERITY_VARIANTS: Record<InsightSeverity, 'destructive' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  high: 'secondary',
  medium: 'outline',
  low: 'outline',
}

const SEVERITY_COLORS: Record<InsightSeverity, string> = {
  critical: 'text-red-500',
  high: 'text-foreground',
  medium: 'text-amber-500',
  low: 'text-blue-500',
}

const SEVERITY_BG: Record<InsightSeverity, string> = {
  critical: 'bg-red-500/10',
  high: 'bg-muted',
  medium: 'bg-amber-500/10',
  low: 'bg-blue-500/10',
}

const TYPE_LABELS: Record<InsightType, string> = {
  unbilled_work: 'Unbilled Work',
  scope_creep: 'Scope Creep',
  overdue_invoice: 'Overdue',
  overdue_collection: 'Overdue',
  payment_pattern: 'Payment Risk',
  retainer_renewal: 'Renewal',
  retainer_underuse: 'Underuse',
  retainer_overuse: 'Overuse',
  revenue_decline: 'Decline',
  collection_opportunity: 'Collection',
  rate_optimization: 'Rate',
  client_churn_risk: 'Churn Risk',
  cash_flow_warning: 'Cash Flow',
}

const TYPE_ICONS: Record<InsightType, string> = {
  unbilled_work: '$',
  scope_creep: '+',
  overdue_invoice: '!',
  overdue_collection: '!',
  payment_pattern: '~',
  retainer_renewal: 'R',
  retainer_underuse: '-',
  retainer_overuse: '+',
  revenue_decline: 'v',
  collection_opportunity: '$',
  rate_optimization: '%',
  client_churn_risk: 'X',
  cash_flow_warning: 'W',
}

// ─── Component ──────────────────────────────────────────────────────────────

interface InsightCardProps {
  insight: RevenueInsight & { contact_name?: string | null }
  onAction: (id: string, status: 'acknowledged' | 'actioned' | 'dismissed') => void
}

export function RevenueInsightCard({ insight, onAction }: InsightCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [hovering, setHovering] = useState(false)

  return (
    <div
      className={`flex items-start gap-3 rounded-lg p-3 backdrop-blur-lg cursor-pointer transition-colors ${
        hovering ? 'bg-accent' : 'bg-card'
      }`}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Severity Icon */}
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-sm font-medium ${SEVERITY_BG[insight.severity]} ${SEVERITY_COLORS[insight.severity]}`}>
        {TYPE_ICONS[insight.insight_type] ?? '?'}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{insight.title}</span>
          <Badge variant={SEVERITY_VARIANTS[insight.severity]} className="shrink-0 uppercase text-xs tracking-wide">
            {TYPE_LABELS[insight.insight_type] ?? insight.insight_type}
          </Badge>
        </div>

        <div className="text-sm text-muted-foreground line-clamp-2">{insight.description}</div>

        {/* Expanded: show recommended action + action buttons */}
        {expanded && (
          <>
            {insight.recommended_action && (
              <div className="text-sm text-green-500 mt-1 font-medium">
                Recommended: {insight.recommended_action}
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <button
                className="text-sm font-medium px-3 py-1 rounded bg-green-500 text-black border-none cursor-pointer transition-opacity hover:opacity-80"
                onClick={(e) => { e.stopPropagation(); onAction(insight.id, 'actioned') }}
              >
                Mark Done
              </button>
              <button
                className="text-sm font-medium px-3 py-1 rounded bg-accent text-muted-foreground border-none cursor-pointer transition-opacity hover:opacity-80"
                onClick={(e) => { e.stopPropagation(); onAction(insight.id, 'dismissed') }}
              >
                Dismiss
              </button>
            </div>
          </>
        )}
      </div>

      {/* Amount */}
      {insight.amount_cents > 0 && (
        <span className="shrink-0 font-mono font-medium text-sm text-foreground">{formatCents(insight.amount_cents)}</span>
      )}
    </div>
  )
}
