'use client'

import { useRef, useState, useCallback, useEffect, useMemo, type RefObject } from 'react'

interface UseSmartScrollResult {
  shouldShowScrollButton: boolean
  scrollToBottom: () => void
  onScroll: () => void
  onContentUpdate: () => void
}

const NEAR_BOTTOM_THRESHOLD = 60
const SCROLL_UP_LOCK_MS = 1500

/**
 * Smart auto-scroll hook with near-bottom detection.
 *
 * - Auto-scrolls when user is near bottom and new content arrives
 * - When user scrolls up, locks auto-scroll for 1.5s so streaming
 *   content doesn't yank them back down
 * - Shows "scroll to bottom" button when not at bottom
 */
export function useSmartScroll(
  scrollRef: RefObject<HTMLDivElement | null>
): UseSmartScrollResult {
  const [shouldShowScrollButton, setShouldShowScrollButton] = useState(false)
  const isNearBottomRef = useRef(true)
  const userScrolledUpRef = useRef(false)
  const scrollLockUntilRef = useRef(0)
  const lastScrollTopRef = useRef(0)
  // When true, the onScroll listener ignores events (prevents smooth
  // scroll animation frames from being misinterpreted as user scroll-up).
  const programmaticScrollRef = useRef(false)

  const computeNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    return distFromBottom < NEAR_BOTTOM_THRESHOLD
  }, [scrollRef])

  const onScroll = useCallback(() => {
    // Ignore scroll events caused by programmatic scrollToBottom
    if (programmaticScrollRef.current) return

    const el = scrollRef.current
    if (!el) return

    const currentScrollTop = el.scrollTop
    const scrolledUp = currentScrollTop < lastScrollTopRef.current - 5
    lastScrollTopRef.current = currentScrollTop

    // If user actively scrolled up, lock auto-scroll for a period
    if (scrolledUp) {
      userScrolledUpRef.current = true
      scrollLockUntilRef.current = Date.now() + SCROLL_UP_LOCK_MS
    }

    const nearBottom = computeNearBottom()
    isNearBottomRef.current = nearBottom

    // Clear the scroll lock if user scrolled back to bottom
    if (nearBottom) {
      userScrolledUpRef.current = false
      scrollLockUntilRef.current = 0
    }

    const hasOverflow = el.scrollHeight > el.clientHeight + 10
    setShouldShowScrollButton(!nearBottom && hasOverflow)
  }, [computeNearBottom, scrollRef])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    userScrolledUpRef.current = false
    scrollLockUntilRef.current = 0
    programmaticScrollRef.current = true
    // Use instant scroll for history loads; smooth scroll causes
    // animation frames that fight with onContentUpdate.
    el.scrollTop = el.scrollHeight
    lastScrollTopRef.current = el.scrollTop
    isNearBottomRef.current = true
    setShouldShowScrollButton(false)
    // Re-enable scroll detection on the next frame
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false
    })
  }, [scrollRef])

  // Called when new content arrives -- scrolls only if user is near bottom
  // and hasn't actively scrolled up recently
  const onContentUpdate = useCallback(() => {
    // Respect the scroll lock
    if (Date.now() < scrollLockUntilRef.current) return
    if (userScrolledUpRef.current) return

    if (isNearBottomRef.current) {
      const el = scrollRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
        lastScrollTopRef.current = el.scrollTop
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

  // Stabilise the return object so consumers using the whole hook result as
  // a useEffect dep (common pattern) don't re-fire on every render.
  return useMemo(
    () => ({ shouldShowScrollButton, scrollToBottom, onScroll, onContentUpdate }),
    [shouldShowScrollButton, scrollToBottom, onScroll, onContentUpdate],
  )
}
