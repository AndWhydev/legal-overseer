'use client'

import { motion } from 'motion/react'
import { type ReactNode } from 'react'

/**
 * Circular progress ring wrapping a centered icon. Used in stat cards
 * and KPI displays to show completion percentage with a visual icon.
 */
export interface ProgressRingIconProps {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
  trackColor?: string
  icon: ReactNode
  iconSize?: number
  animate?: boolean
  className?: string
}

export function ProgressRingIcon({
  value,
  size = 48,
  strokeWidth = 2.5,
  color = 'var(--bb-orange)',
  trackColor = 'rgba(255,255,255,0.06)',
  icon,
  iconSize = 20,
  animate = true,
  className,
}: ProgressRingIconProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, value))
  const offset = circumference - (clamped / 100) * circumference

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
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={animate ? { strokeDashoffset: circumference } : { strokeDashoffset: offset }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: iconSize,
          color: color,
        }}
      >
        {icon}
      </div>
    </div>
  )
}
