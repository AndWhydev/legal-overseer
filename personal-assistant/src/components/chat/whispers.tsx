'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { IconX } from '@tabler/icons-react'
import type { Whisper } from '@/lib/whispers/types'
import { Button } from '@/components/ui/button'

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
              className="relative rounded-lg border border-border bg-secondary px-7 pl-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors text-center whitespace-nowrap cursor-pointer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
              transition={{
                delay: 0.3 + i * 0.15,
                duration: 0.35,
                ease: [0.25, 1, 0.5, 1],
              }}
            >
              {whisper.text}
              {/* Dismiss button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 hover:opacity-100"
                onClick={(e) => handleDismiss(index, e)}
                aria-label="Dismiss whisper"
              >
                <IconX size={10} />
              </Button>
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
