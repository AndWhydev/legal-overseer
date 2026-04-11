'use client'

import { type ReactNode } from 'react'

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
  padding: '16px 20px',
  borderRadius: 'var(--radius-xl)',
  background: 'var(--bg-card)',
  border: 'none',
  boxShadow: 'var(--card-shadow)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 200,
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
  const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'

  return (
    <div className={className} style={cardStyle}>
      {/* Row 1: Label */}
      <span
        style={{
          fontSize: 14,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-sans)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>

      {/* Row 2: Left side (value + trend + subtitle) + Right side (chart) */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {/* Left side: value with unit, then trend below, then subtitle below */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          {/* Value + unit */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            {unit && (
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {unit}
              </span>
            )}
            <span
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              {value}
            </span>
          </div>

          {/* Trend */}
          {trend && trendValue && (
            <span style={{ fontSize: 14, color: trendColor, fontWeight: 500 }}>
              {trendArrow} {trendValue}
            </span>
          )}

          {/* Subtitle */}
          {subtitle && (
            <span
              style={{
                fontSize: 14,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-sans)',
                opacity: 0.7,
              }}
            >
              {subtitle}
            </span>
          )}
        </div>

        {/* Right side: chart slot */}
        {chart && (
          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            {chart}
          </div>
        )}
      </div>
    </div>
  )
}
