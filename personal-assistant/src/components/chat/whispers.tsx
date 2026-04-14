'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { IconX } from '@tabler/icons-react'
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
          className="flex flex-col items-center gap-2 mt-6"
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
              className="group flex items-center gap-1.5 max-w-[280px] sm:max-w-[360px] rounded-full border border-border bg-secondary px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-left cursor-pointer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
              transition={{
                delay: 0.3 + i * 0.15,
                duration: 0.35,
                ease: [0.25, 1, 0.5, 1],
              }}
            >
              <span className="truncate flex-1">{whisper.text}</span>
              <span
                role="button"
                tabIndex={-1}
                className="shrink-0 flex items-center justify-center h-4 w-4 rounded-full opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                onClick={(e) => handleDismiss(index, e)}
                aria-label="Dismiss whisper"
              >
                <IconX size={10} />
              </span>
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
