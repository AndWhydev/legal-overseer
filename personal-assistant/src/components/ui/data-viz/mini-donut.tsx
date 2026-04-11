'use client'

import { useState } from 'react'
import { motion } from 'motion/react'

/**
 * Compact donut/ring chart with animated segments and optional center label.
 * Renders as an SVG circle with stroke-dasharray segments.
 * When interactive, supports hover to highlight individual segments and display their values.
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
  interactive?: boolean
  formatValue?: (v: number) => string
  className?: string
}

export function MiniDonut({
  segments,
  size = 48,
  strokeWidth = 5,
  color = 'var(--bb-orange)',
  centerLabel,
  animate = true,
  interactive = false,
  formatValue = (v) => v.toString(),
  className,
}: MiniDonutProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1

  let accumulated = 0

  const displayLabel =
    interactive && activeIndex !== null
      ? `${segments[activeIndex].label || 'Value'}: ${formatValue(segments[activeIndex].value)}`
      : centerLabel

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

          const isActive = interactive && activeIndex === i
          const isInactive = interactive && activeIndex !== null && activeIndex !== i

          return (
            <g key={i}>
              {/* Main visible segment */}
              <motion.circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color || color}
                strokeWidth={isActive ? strokeWidth + 2 : strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${dashLen} ${dashGap}`}
                strokeDashoffset={segOffset}
                opacity={isInactive ? 0.3 : 1}
                initial={{ opacity: animate ? 0 : 1 }}
                animate={{ opacity: isInactive ? 0.3 : 1, strokeWidth: isActive ? strokeWidth + 2 : strokeWidth }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              />
              {/* Invisible hit target for hover */}
              {interactive && (
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={strokeWidth + 8}
                  strokeDasharray={`${dashLen} ${dashGap}`}
                  strokeDashoffset={segOffset}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                  style={{ cursor: 'pointer' }}
                />
              )}
            </g>
          )
        })}
      </svg>
      {displayLabel && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size * 0.22,
            fontWeight: 500,
            color: interactive && activeIndex !== null ? segments[activeIndex].color || color : 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            transition: 'color 0.2s ease-out',
          }}
        >
          {displayLabel}
        </div>
      )}
    </div>
  )
}
