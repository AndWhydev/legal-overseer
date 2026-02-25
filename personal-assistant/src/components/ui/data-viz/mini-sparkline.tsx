'use client'

import { motion } from 'motion/react'
import { HatchPattern } from './hatch-pattern'

/**
 * Compact sparkline chart with animated path drawing and optional
 * hatch-pattern fill area beneath the line.
 */
export interface MiniSparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  filled?: boolean
  strokeWidth?: number
  animate?: boolean
  className?: string
}

export function MiniSparkline({
  data,
  width = 160,
  height = 40,
  color = 'var(--bb-orange)',
  filled = true,
  strokeWidth = 1.5,
  animate = true,
  className,
}: MiniSparklineProps) {
  if (data.length < 2) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pad = 2

  const points = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`
  const hatchId = `sparkline-hatch-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
      {filled && (
        <>
          <defs>
            <linearGradient id={`${hatchId}-area-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            <mask id={`${hatchId}-fade-mask`}>
              <linearGradient id={`${hatchId}-fade-grad`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="white" stopOpacity={0.8} />
                <stop offset="100%" stopColor="white" stopOpacity={0} />
              </linearGradient>
              <rect x="0" y="0" width={width} height={height} fill={`url(#${hatchId}-fade-grad)`} />
            </mask>
          </defs>
          <HatchPattern id={hatchId} color={color} spacing={4} strokeWidth={1} angle={45} gradientFade />
          {/* Solid color gradient fill underneath */}
          <motion.path
            d={areaPath}
            fill={`url(#${hatchId}-area-grad)`}
            initial={animate ? { opacity: 0 } : undefined}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          />
          {/* Hatch pattern overlay on top with fade mask */}
          <motion.path
            d={areaPath}
            fill={`url(#${hatchId})`}
            mask={`url(#${hatchId}-fade-mask)`}
            initial={animate ? { opacity: 0 } : undefined}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          />
        </>
      )}
      <motion.path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={2.5}
        fill={color}
      />
    </svg>
  )
}
