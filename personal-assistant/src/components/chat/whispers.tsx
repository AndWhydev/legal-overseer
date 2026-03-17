'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { Whisper } from '@/lib/whispers/types'

interface WhispersProps {
  onTapWhisper: (whisper: Whisper) => void
  visible: boolean
}

export function Whispers({ onTapWhisper, visible }: WhispersProps) {
  const [whispers, setWhispers] = useState<Whisper[]>([])
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

  if (!loaded || whispers.length === 0) return null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            maxWidth: 340,
            marginTop: 32,
          }}
          exit={{
            opacity: 0,
            y: 4,
            transition: { duration: 0.15 },
          }}
        >
          {whispers.map((whisper, i) => (
            <motion.button
              key={`${whisper.source}-${i}`}
              onClick={() => handleTap(whisper)}
              style={{
                background: 'none',
                border: 'none',
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 400,
                color: 'var(--text-secondary, #94A3B8)',
                lineHeight: '28px',
                textAlign: 'center',
                transition: 'color 200ms, background 200ms',
                maxWidth: '100%',
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.3 + i * 0.2,
                duration: 0.4,
                ease: [0.25, 1, 0.5, 1],
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary, #F1F5F9)'
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary, #94A3B8)'
                e.currentTarget.style.background = 'none'
              }}
            >
              {whisper.text}
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
