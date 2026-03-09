'use client'

import { motion } from 'motion/react'

/**
 * Compact donut/ring chart with animated segments and optional center label.
 * Renders as an SVG circle with stroke-dasharray segments.
 */
export interface DonutSegment {
  value: number
  color?: string
  label?: string
}

export interface MiniDonutProps {
  segments: DonutSegment[]
  size?: number
  strokeWidth?: number
  color?: string
  centerLabel?: string
  animate?: boolean
  className?: string
}

export function MiniDonut({
  segments,
  size = 48,
  strokeWidth = 5,
  color = 'var(--bb-orange)',
  centerLabel,
  animate = true,
  className,
}: MiniDonutProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1

  let accumulated = 0

  return (
    <div className={className} style={{ position: 'relative', width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={strokeWidth}
        />
        {segments.map((seg, i) => {
          const ratio = seg.value / total
          const dashLen = ratio * circumference
          const dashGap = circumference - dashLen
          const segOffset = -(accumulated / total) * circumference

          accumulated += seg.value

          return (
            <motion.circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color || color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${dashLen} ${dashGap}`}
              strokeDashoffset={segOffset}
              initial={animate ? { opacity: 0 } : undefined}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            />
          )
        })}
      </svg>
      {centerLabel && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size * 0.22,
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {centerLabel}
        </div>
      )}
    </div>
  )
}
