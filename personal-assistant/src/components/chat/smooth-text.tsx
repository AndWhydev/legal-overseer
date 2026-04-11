'use client'

import { useEffect, useRef, useState, memo } from 'react'

interface SmoothTextProps {
  /** The full text to reveal character by character */
  content: string
  /** Render function — receives the currently revealed portion of content */
  children: (displayed: string) => React.ReactNode
  /** Called once the full text has been revealed */
  onComplete?: () => void
}

/**
 * Replicates the useSmoothStream typing effect for static text.
 * Uses the same RAF-based adaptive speed algorithm:
 *  - Buffer > 200 chars: 8 chars/frame (catching up)
 *  - Buffer > 100 chars: 5 chars/frame
 *  - Buffer 20-100 chars: 3 chars/frame (smooth feel)
 *  - Buffer < 20 chars: 1 char/frame (graceful coast)
 */
export const SmoothText = memo(function SmoothText({ content, children, onComplete }: SmoothTextProps) {
  const [displayed, setDisplayed] = useState('')
  const posRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const contentRef = useRef(content)
  const completeRef = useRef(false)
  const onCompleteRef = useRef(onComplete)

  // Track content changes
  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    // Reset on new content
    posRef.current = 0
    completeRef.current = false

    if (!content) return

    const tick = () => {
      const pos = posRef.current
      const remaining = contentRef.current.length - pos

      if (remaining <= 0) {
        if (!completeRef.current) {
          completeRef.current = true
          onCompleteRef.current?.()
        }
        rafRef.current = null
        return
      }

      let charsPerFrame: number
      if (remaining > 200) {
        charsPerFrame = 8
      } else if (remaining > 100) {
        charsPerFrame = 5
      } else if (remaining >= 20) {
        charsPerFrame = 3
      } else {
        charsPerFrame = 1
      }

      posRef.current = Math.min(pos + charsPerFrame, contentRef.current.length)
      setDisplayed(contentRef.current.slice(0, posRef.current))

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [content])

  return <>{children(displayed)}</>
})
