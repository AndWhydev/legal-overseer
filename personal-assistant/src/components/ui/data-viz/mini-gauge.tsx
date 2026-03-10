'use client'

import { useState } from 'react'
import { motion } from 'motion/react'

/**
 * Semi-circular gauge visualization showing a percentage value.
 * Renders as an animated SVG half-circle with value and optional label.
 * When interactive, supports hover to highlight the arc and apply glow effects.
 */
export interface MiniGaugeProps {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
  showValue?: boolean
  animate?: boolean
  interactive?: boolean
  formatValue?: (v: number) => string
  className?: string
}

export function MiniGauge({
  value,
  size = 64,
  strokeWidth = 4,
  color = 'var(--bb-orange)',
  label,
  showValue = true,
  animate = true,
  interactive = false,
  formatValue = (v) => `${v}%`,
  className,
}: MiniGaugeProps) {
  const [hovered, setHovered] = useState(false)
  const clamped = Math.min(100, Math.max(0, value))
  const radius = (size - strokeWidth) / 2
  const halfCircumference = Math.PI * radius
  const offset = halfCircumference - (clamped / 100) * halfCircumference

  return (
    <div className={className} style={{ width: size, textAlign: 'center' }}>
      <svg
        width={size}
        height={size / 2 + strokeWidth}
        viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}
      >
        <g transform={`translate(${size / 2}, ${size / 2})`}>
          <path
            d={`M ${-radius} 0 A ${radius} ${radius} 0 0 1 ${radius} 0`}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <motion.path
            d={`M ${-radius} 0 A ${radius} ${radius} 0 0 1 ${radius} 0`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={halfCircumference}
            initial={animate ? { strokeDashoffset: halfCircumference } : { strokeDashoffset: offset }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={
              interactive && hovered
                ? { filter: `drop-shadow(0 0 6px ${color})` }
                : undefined
            }
          />
          {/* Invisible hit target for hover */}
          {interactive && (
            <path
              d={`M ${-radius} 0 A ${radius} ${radius} 0 0 1 ${radius} 0`}
              fill="none"
              stroke="transparent"
              strokeWidth={strokeWidth + 10}
              strokeLinecap="round"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              style={{ cursor: 'pointer' }}
            />
          )}
        </g>
      </svg>
      {showValue && (
        <motion.div
          style={{
            marginTop: -size * 0.18,
            fontSize: interactive && hovered ? size * 0.25 : size * 0.22,
            fontWeight: 700,
            color: interactive && hovered ? color : 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            transition: 'all 0.2s ease-out',
          }}
          animate={{
            fontSize: interactive && hovered ? size * 0.25 : size * 0.22,
            color: interactive && hovered ? color : 'var(--text-primary)',
          }}
          transition={{ duration: 0.2 }}
        >
          {formatValue(clamped)}
        </motion.div>
      )}
      {label && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-secondary)',
            marginTop: 2,
          }}
        >
          {label}
        </div>
      )}
    </div>
  )
}
