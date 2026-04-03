'use client'

import { type ReactNode } from 'react'
import { MiniSparkline } from './mini-sparkline'

/**
 * KPI (Key Performance Indicator) widget card with value, trend indicator,
 * and optional embedded sparkline chart. Uses glassmorphic card styling.
 */
export interface KPIWidgetProps {
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'flat'
  trendValue?: string
  sparklineData?: number[]
  color?: string
  icon?: ReactNode
  className?: string
}

const cardStyle: React.CSSProperties = {
  padding: '20px 24px',
  borderRadius: 'var(--radius-xl)',
  background: 'var(--bg-card)',
  border: 'none',
  boxShadow: 'var(--card-shadow), var(--card-inset)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

export function KPIWidget({
  label,
  value,
  unit,
  trend,
  trendValue,
  sparklineData,
  color = 'var(--bb-orange)',
  icon,
  className,
}: KPIWidgetProps) {
  const trendColor =
    trend === 'up' ? 'var(--bb-green)' : trend === 'down' ? 'var(--bb-red)' : 'var(--text-secondary)'
  const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'

  return (
    <div className={className} style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <span style={{ color, display: 'flex', alignItems: 'center' }}>{icon}</span>}
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {unit}
          </span>
        )}
        {trend && (
          <span style={{ fontSize: 14, color: trendColor, fontWeight: 500, marginLeft: 'auto' }}>
            {trendArrow} {trendValue}
          </span>
        )}
      </div>
      {sparklineData && sparklineData.length > 1 && (
        <MiniSparkline data={sparklineData} color={color} height={28} width={180} />
      )}
    </div>
  )
}
