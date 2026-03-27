'use client'

import React, { useState } from 'react'
import type { RevenueInsight, InsightType, InsightSeverity } from '@/lib/revenue/types'
import { formatCents } from '@/lib/revenue/types'
import { S, C } from '@/lib/styles/design-tokens'

// ─── Severity + Type Config ─────────────────────────────────────────────────

const SEVERITY_COLORS: Record<InsightSeverity, string> = {
  critical: 'var(--bb-red)',
  high: 'var(--text-primary, #F1F5F9)',
  medium: 'var(--bb-amber)',
  low: 'var(--bb-blue)',
}

const SEVERITY_BG: Record<InsightSeverity, string> = {
  critical: C.statusErrorBg,
  high: C.bgHoverStrong,
  medium: C.statusWarningBg,
  low: 'rgba(59, 130, 246, 0.08)',
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

// ─── Styles ─────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-card)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  cursor: 'pointer',
  transition: 'background var(--duration-fast) var(--ease-default)',
}

const iconStyle = (severity: InsightSeverity): React.CSSProperties => ({
  width: 32,
  height: 32,
  borderRadius: 'var(--radius-md)',
  background: SEVERITY_BG[severity],
  color: SEVERITY_COLORS[severity],
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 500,
  fontFamily: 'var(--font-mono)',
  flexShrink: 0,
})

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
}

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const titleTextStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const badgeStyle = (severity: InsightSeverity): React.CSSProperties => ({
  fontSize: 14,
  fontWeight: 500,
  color: SEVERITY_COLORS[severity],
  background: SEVERITY_BG[severity],
  padding: '2px 8px',
  borderRadius: 'var(--radius-sm)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  flexShrink: 0,
})

const descStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
}

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 4,
}

const actionBtnStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  padding: '4px 12px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  cursor: 'pointer',
  transition: 'opacity var(--duration-fast) var(--ease-default)',
}

const amountStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-primary, #F1F5F9)',
  flexShrink: 0,
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
      style={{
        ...cardStyle,
        background: hovering ? 'var(--bb-surface-hover)' : 'var(--bg-card)',
      }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Severity Icon */}
      <div style={iconStyle(insight.severity)}>
        {TYPE_ICONS[insight.insight_type] ?? '?'}
      </div>

      {/* Body */}
      <div style={bodyStyle}>
        <div style={titleRowStyle}>
          <span style={titleTextStyle}>{insight.title}</span>
          <span style={badgeStyle(insight.severity)}>
            {TYPE_LABELS[insight.insight_type] ?? insight.insight_type}
          </span>
        </div>

        <div style={descStyle}>{insight.description}</div>

        {/* Expanded: show recommended action + action buttons */}
        {expanded && (
          <>
            {insight.recommended_action && (
              <div style={{
                fontSize: 14,
                color: 'var(--bb-green)',
                marginTop: 4,
                fontWeight: 500,
              }}>
                Recommended: {insight.recommended_action}
              </div>
            )}
            <div style={actionRowStyle}>
              <button
                style={{
                  ...actionBtnStyle,
                  background: 'var(--bb-green)',
                  color: '#000',
                }}
                onClick={(e) => { e.stopPropagation(); onAction(insight.id, 'actioned') }}
              >
                Mark Done
              </button>
              <button
                style={{
                  ...actionBtnStyle,
                  background: 'var(--bb-surface-hover)',
                  color: 'var(--text-secondary)',
                }}
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
        <span style={amountStyle}>{formatCents(insight.amount_cents)}</span>
      )}
    </div>
  )
}
