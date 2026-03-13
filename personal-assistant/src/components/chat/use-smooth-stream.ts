'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

interface UseSmoothStreamResult {
  displayedContent: string
  feedContent: (chunk: string) => void
  reset: () => void
  isBuffering: boolean
}

/**
 * Optimistic character-by-character rendering hook.
 * Creates smooth "always flowing" text appearance even when server sends bursty chunks.
 *
 * Adaptive speed:
 *  - Buffer > 200 chars: 8 chars/frame (catching up)
 *  - Buffer > 100 chars: 5 chars/frame
 *  - Buffer 20-100 chars: 3 chars/frame (smooth feel)
 *  - Buffer < 20 chars: 1 char/frame (graceful coast)
 *  - Buffer empty: stop RAF loop, resume on new content
 */
export function useSmoothStream(): UseSmoothStreamResult {
  const [displayed, setDisplayed] = useState('')
  const bufferRef = useRef('')
  const displayedRef = useRef('')
  const rafRef = useRef<number | null>(null)
  const isRunningRef = useRef(false)

  const tick = useCallback(() => {
    if (bufferRef.current.length === 0) {
      // Buffer empty -- stop loop, will resume when new content arrives
      isRunningRef.current = false
      rafRef.current = null
      return
    }

    const bufLen = bufferRef.current.length
    let charsPerFrame: number

    if (bufLen > 200) {
      charsPerFrame = 8
    } else if (bufLen > 100) {
      charsPerFrame = 5
    } else if (bufLen >= 20) {
      charsPerFrame = 3
    } else {
      charsPerFrame = 1
    }

    const chunk = bufferRef.current.slice(0, charsPerFrame)
    bufferRef.current = bufferRef.current.slice(charsPerFrame)
    displayedRef.current += chunk

    // Single setState per frame to avoid excessive re-renders
    setDisplayed(displayedRef.current)

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const feedContent = useCallback(
    (chunk: string) => {
      bufferRef.current += chunk

      // Start the RAF loop if not already running
      if (!isRunningRef.current) {
        isRunningRef.current = true
        rafRef.current = requestAnimationFrame(tick)
      }
    },
    [tick]
  )

  const reset = useCallback(() => {
    bufferRef.current = ''
    displayedRef.current = ''
    setDisplayed('')
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    isRunningRef.current = false
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  const isBuffering = bufferRef.current.length > 0

  return { displayedContent: displayed, feedContent, reset, isBuffering }
}
