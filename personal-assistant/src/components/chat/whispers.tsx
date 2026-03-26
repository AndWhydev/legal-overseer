'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { Whisper } from '@/lib/whispers/types'

const MAX_VISIBLE = 3

interface WhispersProps {
  onTapWhisper: (whisper: Whisper) => void
  visible: boolean
}

export function Whispers({ onTapWhisper, visible }: WhispersProps) {
  const [whispers, setWhispers] = useState<Whisper[]>([])
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch('/api/whispers')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.whispers?.length) {
          setWhispers(data.whispers)
        }
        if (!cancelled) setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleTap = useCallback(
    (whisper: Whisper) => {
      onTapWhisper(whisper)
    },
    [onTapWhisper],
  )

  const handleDismiss = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(index)
      return next
    })
  }, [])

  const visibleWhispers = whispers
    .map((w, i) => ({ whisper: w, index: i }))
    .filter(({ index }) => !dismissed.has(index))
    .slice(0, MAX_VISIBLE)

  if (!loaded || visibleWhispers.length === 0) return null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            maxWidth: 360,
            marginTop: 24,
          }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            y: 4,
            transition: { duration: 0.15 },
          }}
        >
          {visibleWhispers.map(({ whisper, index }, i) => (
            <motion.button
              key={`${whisper.source}-${index}`}
              onClick={() => handleTap(whisper)}
              style={{
                position: 'relative',
                background: 'var(--glass-hover-bg, rgba(255, 255, 255, 0.04))',
                border: '1px solid var(--glass-card-border, rgba(255, 255, 255, 0.06))',
                padding: '4px 28px 4px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 400,
                color: 'var(--text-secondary, #94A3B8)',
                lineHeight: '20px',
                textAlign: 'center',
                transition: 'color 200ms, background 200ms',
                maxWidth: '100%',
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
              transition={{
                delay: 0.3 + i * 0.15,
                duration: 0.35,
                ease: [0.25, 1, 0.5, 1],
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary, #F1F5F9)'
                e.currentTarget.style.background =
                  'var(--glass-hover-bg, rgba(255, 255, 255, 0.06))'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary, #94A3B8)'
                e.currentTarget.style.background =
                  'var(--glass-hover-bg, rgba(255, 255, 255, 0.04))'
              }}
            >
              {whisper.text}
              {/* Dismiss button */}
              <span
                onClick={(e) => handleDismiss(index, e)}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 14,
                  lineHeight: '16px',
                  width: 16,
                  height: 16,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  color: 'var(--text-dim, #64748B)',
                  cursor: 'pointer',
                  opacity: 0.5,
                  transition: 'opacity 150ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.5'
                }}
                role="button"
                aria-label="Dismiss whisper"
              >
                &times;
              </span>
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
