'use client'

import { motion } from 'motion/react'

/**
 * Semi-circular gauge visualization showing a percentage value.
 * Renders as an animated SVG half-circle with value and optional label.
 */
export interface MiniGaugeProps {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
  showValue?: boolean
  animate?: boolean
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
  className,
}: MiniGaugeProps) {
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
          />
        </g>
      </svg>
      {showValue && (
        <div
          style={{
            marginTop: -size * 0.18,
            fontSize: size * 0.22,
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {clamped}%
        </div>
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
