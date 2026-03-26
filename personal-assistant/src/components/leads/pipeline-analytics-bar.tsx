'use client'

import React, { memo } from 'react'
import { DollarSign, Target, Clock, Zap, AlertTriangle } from 'lucide-react'
import type { PipelineAnalytics } from '@/lib/leads/types'
import { formatPipelineValue } from '@/lib/leads/utils'

interface PipelineAnalyticsBarProps {
  analytics: PipelineAnalytics | null
  isLoading: boolean
}

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderRadius: 16,
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05))',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-secondary, #94A3B8)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const valueStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  letterSpacing: '-0.02em',
  color: 'var(--text-primary, #F1F5F9)',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  gap: 12,
}

const skeletonCard: React.CSSProperties = {
  ...cardStyle,
  height: 80,
  animation: 'pulse 1.5s ease-in-out infinite',
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getSpeedColor(minutes: number | null): string {
  if (minutes == null) return 'var(--text-dim, #475569)'
  if (minutes <= 5) return '#22c55e'
  if (minutes <= 30) return '#eab308'
  return '#ef4444'
}

// ─── Component ──────────────────────────────────────────────────────────────
function PipelineAnalyticsBarInner({ analytics, isLoading }: PipelineAnalyticsBarProps) {
  if (isLoading || !analytics) {
    return (
      <>
        <div style={gridStyle}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ ...skeletonCard, animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
        <style>{`
          @media (max-width: 768px) {
            [style*="grid-template-columns: repeat(5"] { grid-template-columns: repeat(2, 1fr) !important; }
          }
        `}</style>
      </>
    )
  }

  const speedMinutes = analytics.avgSpeedToLeadMinutes
  const speedDisplay = speedMinutes != null
    ? (speedMinutes < 60 ? `${speedMinutes}m` : `${Math.floor(speedMinutes / 60)}h ${speedMinutes % 60}m`)
    : '--'

  return (
    <>
      <div style={gridStyle}>
        <div style={cardStyle}>
          <div style={labelStyle}>
            <DollarSign size={16} />
            Pipeline Value
          </div>
          <div style={valueStyle}>{formatPipelineValue(analytics.totalValue)}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>
            <Target size={16} />
            Conversion Rate
          </div>
          <div style={valueStyle}>{analytics.conversionRate}%</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>
            <Clock size={16} />
            Avg Days in Stage
          </div>
          <div style={valueStyle}>{analytics.avgDaysInStage}d</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>
            <Zap size={16} />
            Speed-to-Lead
          </div>
          <div style={{ ...valueStyle, color: getSpeedColor(speedMinutes) }}>{speedDisplay}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>
            <AlertTriangle size={16} />
            Stale Leads
          </div>
          <div style={{
            ...valueStyle,
            color: analytics.staleCount > 0 ? '#eab308' : 'var(--text-primary, #F1F5F9)',
          }}>
            {analytics.staleCount}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          [style*="grid-template-columns: repeat(5"] { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </>
  )
}

export const PipelineAnalyticsBar = memo(PipelineAnalyticsBarInner)
