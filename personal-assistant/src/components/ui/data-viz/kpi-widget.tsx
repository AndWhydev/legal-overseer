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
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-shadow, 0 8px 32px rgba(0, 0, 0, 0.3)), var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05))',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
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
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {unit}
          </span>
        )}
        {trend && (
          <span style={{ fontSize: 12, color: trendColor, fontWeight: 600, marginLeft: 'auto' }}>
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
