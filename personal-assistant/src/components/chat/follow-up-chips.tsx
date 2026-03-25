'use client'

import React from 'react'
import { motion } from 'motion/react'

interface FollowUpChipsProps {
  suggestions: string[]
  onSelect: (text: string) => void
}

export function FollowUpChips({ suggestions, onSelect }: FollowUpChipsProps) {
  if (suggestions.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.3 }}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, maxWidth: 600 }}
    >
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            background: 'var(--glass-bg, rgba(15, 20, 30, 0.35))',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            color: 'var(--text-secondary, #94A3B8)',
            fontSize: 13,
            cursor: 'pointer',
            transition: 'all 150ms',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)' }}
        >
          {s}
        </button>
      ))}
    </motion.div>
  )
}
