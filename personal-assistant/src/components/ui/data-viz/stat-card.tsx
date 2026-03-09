'use client'

import { type ReactNode } from 'react'

/**
 * Redesigned statistics card — large value with label to the right,
 * optional trend indicator, embedded chart slot, and subtitle.
 * No icons. Glassmorphic styling with inline React.CSSProperties.
 */
export interface StatCardProps {
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'flat'
  trendValue?: string
  chart?: ReactNode
  subtitle?: string
  color?: string
  className?: string
}

const cardStyle: React.CSSProperties = {
  padding: '20px 24px',
  borderRadius: 'var(--radius-xl)',
  background: 'var(--bg-card)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-shadow), var(--card-inset)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 180,
}

export function StatCard({
  label,
  value,
  unit,
  trend,
  trendValue,
  chart,
  subtitle,
  color = 'var(--bb-orange)',
  className,
}: StatCardProps) {
  const trendColor =
    trend === 'up' ? 'var(--bb-green)' : trend === 'down' ? 'var(--bb-red)' : 'var(--text-secondary)'
  const trendArrow = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192'

  return (
    <div className={className} style={cardStyle}>
      {/* Value row: big number + label to the right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          {unit && (
            <span
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {unit}
            </span>
          )}
          <span
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '-0.03em',
              lineHeight: 1,
            }}
          >
            {value}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 4 }}>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.2,
            }}
          >
            {label}
          </span>
          {trend && trendValue && (
            <span style={{ fontSize: 11, color: trendColor, fontWeight: 600 }}>
              {trendArrow} {trendValue}
            </span>
          )}
        </div>
      </div>

      {/* Chart slot */}
      {chart && <div style={{ width: '100%', overflow: 'hidden' }}>{chart}</div>}

      {/* Subtitle */}
      {subtitle && (
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-sans)',
            opacity: 0.7,
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  )
}
