'use client'

import { motion } from 'motion/react'
import { HatchPattern } from './hatch-pattern'

/**
 * Compact animated bar chart with hatch-pattern fills.
 * Supports per-bar colors, labels, and entrance animations.
 */
export interface BarDatum {
  label?: string
  value: number
  color?: string
}

export interface MiniBarChartProps {
  data: BarDatum[]
  width?: number
  height?: number
  color?: string
  gap?: number
  showLabels?: boolean
  animate?: boolean
  className?: string
}

export function MiniBarChart({
  data,
  width = 160,
  height = 60,
  color = 'var(--bb-orange)',
  gap = 2,
  showLabels = false,
  animate = true,
  className,
}: MiniBarChartProps) {
  const rawMax = Math.max(...data.map((d) => d.value), 1)
  const rawMin = Math.min(...data.map((d) => d.value), 0)
  // Exaggerate differences: raise baseline so small bars are shorter relative to tall ones
  const exaggeratedMin = rawMin + (rawMax - rawMin) * 0.3
  const max = rawMax
  const labelH = showLabels ? 16 : 0
  const chartH = height - labelH
  const barW = (width - gap * (data.length - 1)) / data.length
  const hatchId = `bar-hatch-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      <HatchPattern id={hatchId} color={color} spacing={4} strokeWidth={1} angle={45} gradientFade />
      <defs>
        {data.map((d, i) => {
          const fill = d.color || color
          return (
            <linearGradient key={i} id={`${hatchId}-bar-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fill} stopOpacity={0.3} />
              <stop offset="100%" stopColor={fill} stopOpacity={0} />
            </linearGradient>
          )
        })}
        {/* Fade mask for hatch overlay — matches sparkline */}
        <linearGradient id={`${hatchId}-fade-grad`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={0.7} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </linearGradient>
        <mask id={`${hatchId}-fade-mask`}>
          <rect x="0" y="0" width={width} height={height} fill={`url(#${hatchId}-fade-grad)`} />
        </mask>
      </defs>
      {data.map((d, i) => {
        // Exaggerated height: map from exaggeratedMin..max to 15%..100% of chartH
        const normalised = Math.max(0, (d.value - exaggeratedMin) / (max - exaggeratedMin))
        const barH = Math.max(chartH * 0.08, (normalised * 0.85 + 0.15) * chartH)
        const x = i * (barW + gap)
        const y = chartH - barH
        const fill = d.color || color

        return (
          <g key={i}>
            {/* Gradient background fill */}
            <motion.rect
              x={x}
              y={animate ? chartH : y}
              width={barW}
              rx={2}
              fill={`url(#${hatchId}-bar-grad-${i})`}
              initial={animate ? { height: 0, y: chartH } : undefined}
              animate={{ height: barH, y }}
              transition={{ duration: 0.6, delay: i * 0.05, ease: 'easeOut' }}
            />
            {/* Hatch overlay with gradient fade */}
            <motion.rect
              x={x}
              y={animate ? chartH : y}
              width={barW}
              rx={2}
              fill={`url(#${hatchId})`}
              mask={`url(#${hatchId}-fade-mask)`}
              initial={animate ? { height: 0, y: chartH } : undefined}
              animate={{ height: barH, y }}
              transition={{ duration: 0.6, delay: i * 0.05, ease: 'easeOut' }}
            />
            {showLabels && d.label && (
              <text
                x={x + barW / 2}
                y={height - 1}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize={10}
                fontFamily="var(--font-sans)"
              >
                {d.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
