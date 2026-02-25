'use client'

import { motion } from 'motion/react'

/**
 * Small glowing dot indicator with optional pulse animation.
 * Used for status indicators and live activity signals.
 */
export interface GlowIndicatorProps {
  color?: string
  size?: number
  /** Pulse animation */
  pulse?: boolean
  className?: string
}

export function GlowIndicator({
  color = 'var(--bb-orange)',
  size = 8,
  pulse = true,
  className,
}: GlowIndicatorProps) {
  return (
    <motion.span
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 ${size}px ${color}, 0 0 ${size * 2}px color-mix(in srgb, ${color} 40%, transparent)`,
      }}
      animate={pulse ? { opacity: [1, 0.5, 1] } : undefined}
      transition={pulse ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : undefined}
    />
  )
}
