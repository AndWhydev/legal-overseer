'use client'

import { type ReactNode } from 'react'
import { ProgressRingIcon } from './progress-ring-icon'

/**
 * Statistics card combining a progress ring icon with a label, value,
 * and optional child visualization (sparkline, bar chart, etc.).
 */
export interface StatCardProps {
  label: string
  value: string | number
  unit?: string
  icon: ReactNode
  ringValue?: number
  color?: string
  children?: ReactNode
  className?: string
}

const cardStyle: React.CSSProperties = {
  padding: '20px',
  borderRadius: 'var(--radius-xl)',
  background: 'var(--bg-card)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-shadow, 0 8px 32px rgba(0, 0, 0, 0.3)), var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05))',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  minWidth: 180,
}

export function StatCard({
  label,
  value,
  unit,
  icon,
  ringValue = 75,
  color = 'var(--bb-orange)',
  children,
  className,
}: StatCardProps) {
  return (
    <div className={className} style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ProgressRingIcon
          value={ringValue}
          icon={icon}
          color={color}
          size={42}
          strokeWidth={2.5}
          iconSize={18}
        />
        <div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-sans)',
              marginBottom: 2,
            }}
          >
            {label}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '-0.02em',
              }}
            >
              {value}
            </span>
            {unit && (
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {unit}
              </span>
            )}
          </div>
        </div>
      </div>
      {children && <div style={{ marginTop: 4 }}>{children}</div>}
    </div>
  )
}
