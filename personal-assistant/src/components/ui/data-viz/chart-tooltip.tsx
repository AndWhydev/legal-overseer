'use client'

import { AnimatePresence, motion } from 'motion/react'

export interface ChartTooltipProps {
  visible: boolean
  x: number
  y: number
  label?: string
  value: string
  color?: string
}

export function ChartTooltip({ visible, x, y, label, value, color }: ChartTooltipProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            zIndex: 50,
            padding: '4px 8px',
            borderRadius: 6,
            background: 'var(--bg-elevated, rgba(30, 30, 30, 0.95))',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            whiteSpace: 'nowrap',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
          }}
        >
          {label && (
            <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
              {label}
            </span>
          )}
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: color || 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.2,
            }}
          >
            {value}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
