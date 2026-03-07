'use client'

import { DollarSign, Target, Clock, Zap, AlertTriangle } from 'lucide-react'
import type { PipelineAnalytics } from '@/lib/leads/types'
import { formatPipelineValue } from '@/lib/leads/utils'

interface PipelineAnalyticsBarProps {
  analytics: PipelineAnalytics | null
  isLoading: boolean
}

const SPEED_COLOR: Record<string, string> = {
  fast: 'var(--bb-green, #22C55E)',
  ok: 'var(--bb-amber, #F59E0B)',
  slow: 'var(--bb-red, #EF4444)',
}

function getSpeedColor(minutes: number | null): string {
  if (minutes == null) return '#64748B'
  if (minutes <= 5) return SPEED_COLOR.fast
  if (minutes <= 30) return SPEED_COLOR.ok
  return SPEED_COLOR.slow
}

const cardStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderRadius: 'var(--radius-xl, 16px)',
  background: 'var(--bg-card, rgba(15, 20, 30, 0.4))',
  backdropFilter: 'var(--glass-blur, blur(20px))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-secondary, #64748B)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const valueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  fontFamily: 'var(--font-mono)',
  letterSpacing: '-0.02em',
  color: 'var(--text-primary, #F1F5F9)',
}

export function PipelineAnalyticsBar({ analytics, isLoading }: PipelineAnalyticsBarProps) {
  if (isLoading || !analytics) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ ...cardStyle, height: 80, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
        <style>{`
          @media (max-width: 768px) {
            [style*="grid-template-columns: repeat(5"] { grid-template-columns: repeat(2, 1fr) !important; }
          }
        `}</style>
      </div>
    )
  }

  const speedMinutes = analytics.avgSpeedToLeadMinutes
  const speedDisplay = speedMinutes != null
    ? (speedMinutes < 60 ? `${speedMinutes}m` : `${Math.floor(speedMinutes / 60)}h ${speedMinutes % 60}m`)
    : '—'

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <div style={cardStyle}>
          <div style={labelStyle}>
            <DollarSign style={{ width: 14, height: 14 }} />
            Pipeline Value
          </div>
          <div style={valueStyle}>{formatPipelineValue(analytics.totalValue)}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>
            <Target style={{ width: 14, height: 14 }} />
            Conversion Rate
          </div>
          <div style={valueStyle}>{analytics.conversionRate}%</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>
            <Clock style={{ width: 14, height: 14 }} />
            Avg Days in Stage
          </div>
          <div style={valueStyle}>{analytics.avgDaysInStage}d</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>
            <Zap style={{ width: 14, height: 14 }} />
            Speed-to-Lead
          </div>
          <div style={{ ...valueStyle, color: getSpeedColor(speedMinutes) }}>{speedDisplay}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>
            <AlertTriangle style={{ width: 14, height: 14 }} />
            Stale Leads
          </div>
          <div style={{
            ...valueStyle,
            color: analytics.staleCount > 0 ? 'var(--bb-amber, #F59E0B)' : 'var(--text-primary, #F1F5F9)',
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
