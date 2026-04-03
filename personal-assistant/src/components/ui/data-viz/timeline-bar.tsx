'use client'

import { type ReactNode } from 'react'

/**
 * Horizontal timeline bar with selectable range, event markers, and tick labels.
 * Used for time-based data visualization in dashboards.
 */
export interface TimelineEvent {
  position: number
  color?: string
  label?: string
}

export interface TimelineBarProps {
  startLabel?: string
  endLabel?: string
  selection?: [number, number]
  selectionColor?: string
  events?: TimelineEvent[]
  ticks?: { position: number; label: string }[]
  width?: number | string
  height?: number
  className?: string
  children?: ReactNode
}

export function TimelineBar({
  startLabel,
  endLabel,
  selection,
  selectionColor = 'var(--bb-green)',
  events = [],
  ticks = [],
  width = '100%',
  height = 36,
  className,
}: TimelineBarProps) {
  return (
    <div
      className={className}
      style={{
        width,
        position: 'relative',
        padding: '12px 16px',
        borderRadius: 'var(--radius-xl)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
        boxShadow: 'var(--card-shadow), var(--card-inset)',
      }}
    >
      {ticks.length > 0 && (
        <div style={{ position: 'relative', height: 14, marginBottom: 8 }}>
          {ticks.map((t, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${t.position * 100}%`,
                transform: 'translateX(-50%)',
                fontSize: 14,
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
      <div
        style={{
          position: 'relative',
          height,
          background: 'var(--bb-surface-hover, rgba(255,255,255,0.04))',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}
      >
        {selection && (
          <div
            style={{
              position: 'absolute',
              left: `${selection[0] * 100}%`,
              width: `${(selection[1] - selection[0]) * 100}%`,
              top: 0,
              bottom: 0,
              background: `color-mix(in srgb, ${selectionColor} 15%, transparent)`,
              borderRadius: 4,
            }}
          />
        )}
        {events.map((ev, i) => (
          <div
            key={i}
            title={ev.label}
            style={{
              position: 'absolute',
              left: `${ev.position * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: ev.color || 'var(--bb-red)',
              boxShadow: `0 0 6px ${ev.color || 'var(--bb-red)'}`,
            }}
          />
        ))}
      </div>
      {(startLabel || endLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 14, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {startLabel}
          </span>
          <span style={{ fontSize: 14, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {endLabel}
          </span>
        </div>
      )}
    </div>
  )
}
