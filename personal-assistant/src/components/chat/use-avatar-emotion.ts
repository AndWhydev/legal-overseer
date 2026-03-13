'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

export type AvatarEmotion =
  | 'neutral'
  | 'thinking'
  | 'curious'
  | 'happy'
  | 'concerned'
  | 'focused'
  | 'surprised'
  | 'processing'
  | 'contemplating'
  | 'amused'
  | 'determined'
  | 'skeptical'
  | 'excited'
  | 'drowsy'
  | 'alert'
  | 'mischievous'
  | 'serene'
  | 'confused'
  | 'proud'
  | 'attentive'
  | 'annoyed'

interface UseAvatarEmotionInput {
  isThinking: boolean
  isToolRunning: boolean
  isStreaming: boolean
  hasError: boolean
}

// Ambient emotions — slow, peaceful idle cycling
const AMBIENT_EMOTIONS: AvatarEmotion[] = [
  'neutral',
  'serene',
  'neutral',
  'contemplating',
  'neutral',
  'attentive',
  'neutral',
  'serene',
  'neutral',
  'curious',
  'neutral',
]

// Thinking — expressive, varied, shows the "gears turning"
const THINKING_EMOTIONS: AvatarEmotion[] = [
  'thinking',
  'contemplating',
  'curious',
  'thinking',
  'focused',
  'determined',
  'thinking',
  'skeptical',
  'contemplating',
  'thinking',
  'alert',
  'curious',
  'thinking',
  'confused',
  'thinking',
  'focused',
]

// Streaming — content flowing, pleased
const STREAMING_EMOTIONS: AvatarEmotion[] = [
  'happy',
  'amused',
  'proud',
  'happy',
  'serene',
  'happy',
  'attentive',
  'happy',
]

/**
 * Maps SSE event phases to face emotion states with smooth debounced
 * transitions and ambient cycling. Includes cursor harassment detection
 * for an irritation Easter egg.
 */
export function useAvatarEmotion({
  isThinking,
  isToolRunning,
  isStreaming,
  hasError,
}: UseAvatarEmotionInput): AvatarEmotion {
  const [emotion, setEmotion] = useState<AvatarEmotion>('neutral')
  const prevEmotionRef = useRef<AvatarEmotion>('neutral')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ambientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ambientIndexRef = useRef(0)

  // Cursor harassment tracking for irritation Easter egg
  const cursorEventsRef = useRef<number[]>([])
  const isIrritatedRef = useRef(false)
  const irritationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentPhase = hasError
    ? 'error'
    : isThinking
      ? 'thinking'
      : isToolRunning
        ? 'tools'
        : isStreaming
          ? 'streaming'
          : 'idle'

  // Smooth debounced emotion setter — longer delay for gentler transitions
  const setEmotionSmooth = useCallback((target: AvatarEmotion, delay = 400) => {
    if (target === prevEmotionRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      prevEmotionRef.current = target
      setEmotion(target)
      timerRef.current = null
    }, delay)
  }, [])

  // Track rapid cursor movements over the avatar for irritation
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Only track when idle (not thinking/streaming)
      if (currentPhase !== 'idle') {
        cursorEventsRef.current = []
        return
      }

      // Check if cursor is near any face avatar element
      const target = e.target as Element
      const avatar = target.closest?.('.bb-chat__face-avatar')
      if (!avatar) {
        // Cursor left the avatar — decay harassment counter
        if (cursorEventsRef.current.length > 0) {
          cursorEventsRef.current = cursorEventsRef.current.filter(
            t => Date.now() - t < 3000
          )
        }
        return
      }

      const now = Date.now()
      cursorEventsRef.current.push(now)
      // Keep only last 3 seconds of events
      cursorEventsRef.current = cursorEventsRef.current.filter(t => now - t < 3000)

      // Escalating irritation: 15+ rapid movements in 3s over the avatar
      if (cursorEventsRef.current.length > 15 && !isIrritatedRef.current) {
        isIrritatedRef.current = true
        prevEmotionRef.current = 'annoyed'
        setEmotion('annoyed')

        // Clear any ambient cycling
        if (ambientTimerRef.current) {
          clearTimeout(ambientTimerRef.current)
          ambientTimerRef.current = null
        }

        // Cool down after 3s — transition through skeptical back to neutral
        if (irritationTimerRef.current) clearTimeout(irritationTimerRef.current)
        irritationTimerRef.current = setTimeout(() => {
          prevEmotionRef.current = 'skeptical'
          setEmotion('skeptical')

          irritationTimerRef.current = setTimeout(() => {
            isIrritatedRef.current = false
            cursorEventsRef.current = []
            prevEmotionRef.current = 'neutral'
            setEmotion('neutral')
            irritationTimerRef.current = null
          }, 1500)
        }, 2500)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      if (irritationTimerRef.current) clearTimeout(irritationTimerRef.current)
    }
  }, [currentPhase])

  // Phase-driven emotion cycling
  useEffect(() => {
    // Don't override irritation
    if (isIrritatedRef.current) return

    if (ambientTimerRef.current) {
      clearTimeout(ambientTimerRef.current)
      ambientTimerRef.current = null
    }

    if (currentPhase === 'error') {
      setEmotionSmooth('concerned', 200)
      return
    }

    if (currentPhase === 'tools') {
      setEmotionSmooth('processing', 300)
      return
    }

    const pool =
      currentPhase === 'thinking'
        ? THINKING_EMOTIONS
        : currentPhase === 'streaming'
          ? STREAMING_EMOTIONS
          : AMBIENT_EMOTIONS

    const interval =
      currentPhase === 'thinking'
        ? 2000  // Faster cycling while thinking — more expressive
        : currentPhase === 'streaming'
          ? 3500
          : 6000  // Slower ambient for calm idle

    // Set initial emotion with a gentle transition
    ambientIndexRef.current = 0
    setEmotionSmooth(pool[0], currentPhase === 'idle' ? 500 : 250)

    const cycle = () => {
      if (isIrritatedRef.current) return
      ambientIndexRef.current = (ambientIndexRef.current + 1) % pool.length
      const next = pool[ambientIndexRef.current]
      prevEmotionRef.current = next
      setEmotion(next)
      ambientTimerRef.current = setTimeout(cycle, interval + Math.random() * 2000)
    }

    ambientTimerRef.current = setTimeout(cycle, interval + Math.random() * 1500)

    return () => {
      if (ambientTimerRef.current) clearTimeout(ambientTimerRef.current)
    }
  }, [currentPhase, setEmotionSmooth])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (ambientTimerRef.current) clearTimeout(ambientTimerRef.current)
      if (irritationTimerRef.current) clearTimeout(irritationTimerRef.current)
    }
  }, [])

  return emotion
}
