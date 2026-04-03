'use client'

import React from 'react'
import type { CashFlowProjection } from '@/lib/revenue/types'
import { formatCents } from '@/lib/revenue/types'

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: '16px 20px',
  borderRadius: 'var(--radius-xl)',
  background: 'var(--bg-card)',
}

const columnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
}

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 500,
}

const barContainerStyle: React.CSSProperties = {
  width: '100%',
  height: 80,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  alignItems: 'center',
  position: 'relative',
}

const valueStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-primary)',
  letterSpacing: '-0.02em',
}

const rangeStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  opacity: 0.6,
}

const confidenceStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  marginTop: 4,
}

// ─── Component ──────────────────────────────────────────────────────────────

interface CashFlowBarProps {
  cf30: CashFlowProjection | null
  cf60: CashFlowProjection | null
  cf90: CashFlowProjection | null
}

function ProjectionColumn({ projection, label, color }: {
  projection: CashFlowProjection | null
  label: string
  color: string
}) {
  if (!projection) {
    return (
      <div style={columnStyle}>
        <span style={labelStyle}>{label}</span>
        <div style={barContainerStyle}>
          <span style={{ ...valueStyle, color: 'var(--text-secondary)', opacity: 0.4 }}>--</span>
        </div>
      </div>
    )
  }

  // Determine bar height as percentage of maximum across columns
  const amount = projection.projected_inflow_cents ?? 0

  return (
    <div style={columnStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={barContainerStyle}>
        {/* Confidence range bar (background) */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          width: '60%',
          height: '100%',
          background: `${color}08`,
          borderRadius: 'var(--radius-md)',
        }} />
        {/* Main bar */}
        <div style={{
          position: 'relative',
          width: '60%',
          height: `${Math.min(100, Math.max(20, (projection.confidence_pct ?? 0) * 100))}%`,
          background: `${color}25`,
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'height 0.5s var(--ease-snap)',
        }} />
      </div>
      <span style={{ ...valueStyle, color }}>{formatCents(amount)}</span>
      <span style={rangeStyle}>
        {formatCents(projection.confidence_low_cents ?? 0)} - {formatCents(projection.confidence_high_cents ?? 0)}
      </span>
      <span style={confidenceStyle}>
        {Math.round((projection.confidence_pct ?? 0) * 100)}% confidence
      </span>
    </div>
  )
}

export function CashFlowBar({ cf30, cf60, cf90 }: CashFlowBarProps) {
  return (
    <div style={containerStyle}>
      <ProjectionColumn projection={cf30} label="30 Days" color="var(--bb-green)" />
      <ProjectionColumn projection={cf60} label="60 Days" color="var(--bb-blue)" />
      <ProjectionColumn projection={cf90} label="90 Days" color="var(--bb-purple)" />
    </div>
  )
}
