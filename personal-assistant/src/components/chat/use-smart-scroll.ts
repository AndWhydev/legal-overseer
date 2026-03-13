'use client'

import { useRef, useState, useCallback, useEffect, type RefObject } from 'react'

interface UseSmartScrollResult {
  shouldShowScrollButton: boolean
  scrollToBottom: () => void
  onScroll: () => void
  onContentUpdate: () => void
}

const NEAR_BOTTOM_THRESHOLD = 150

/**
 * Smart auto-scroll hook with near-bottom detection.
 *
 * - Auto-scrolls when user is near bottom and new content arrives
 * - Stops auto-scrolling when user scrolls up
 * - Shows "scroll to bottom" button when not at bottom
 */
export function useSmartScroll(
  scrollRef: RefObject<HTMLDivElement | null>
): UseSmartScrollResult {
  const [shouldShowScrollButton, setShouldShowScrollButton] = useState(false)
  const isNearBottomRef = useRef(true)

  const computeNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    return distFromBottom < NEAR_BOTTOM_THRESHOLD
  }, [scrollRef])

  const onScroll = useCallback(() => {
    const nearBottom = computeNearBottom()
    isNearBottomRef.current = nearBottom

    const el = scrollRef.current
    if (!el) return
    // Only show button when there's overflow content AND we're not near bottom
    const hasOverflow = el.scrollHeight > el.clientHeight + 10
    setShouldShowScrollButton(!nearBottom && hasOverflow)
  }, [computeNearBottom, scrollRef])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    isNearBottomRef.current = true
    setShouldShowScrollButton(false)
  }, [scrollRef])

  // Called when new content arrives -- scrolls only if user is near bottom
  const onContentUpdate = useCallback(() => {
    if (isNearBottomRef.current) {
      const el = scrollRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    }
  }, [scrollRef])

  // Attach scroll listener
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef, onScroll])

  return { shouldShowScrollButton, scrollToBottom, onScroll, onContentUpdate }
}
