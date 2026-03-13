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
  // Expanded library
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

interface UseAvatarEmotionInput {
  isThinking: boolean
  isToolRunning: boolean
  isStreaming: boolean
  hasError: boolean
}

// Ambient emotions that cycle when idle (no active SSE phase)
const AMBIENT_EMOTIONS: AvatarEmotion[] = [
  'neutral',
  'serene',
  'contemplating',
  'curious',
  'attentive',
  'neutral',
  'serene',
  'neutral',
  'mischievous',
  'neutral',
  'alert',
  'neutral',
]

// Emotions to cycle through while thinking (adds variety)
const THINKING_EMOTIONS: AvatarEmotion[] = [
  'thinking',
  'contemplating',
  'curious',
  'thinking',
  'focused',
  'thinking',
]

// Emotions during streaming (content flowing)
const STREAMING_EMOTIONS: AvatarEmotion[] = [
  'happy',
  'amused',
  'proud',
  'happy',
  'serene',
  'happy',
]

/**
 * Maps SSE event phases to face emotion states with debounce
 * and ambient cycling for lifelike behavior.
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
  const phaseRef = useRef<'idle' | 'thinking' | 'tools' | 'streaming' | 'error'>('idle')

  // Determine current phase
  const currentPhase = hasError
    ? 'error'
    : isThinking
      ? 'thinking'
      : isToolRunning
        ? 'tools'
        : isStreaming
          ? 'streaming'
          : 'idle'

  const setEmotionDebounced = useCallback((target: AvatarEmotion, delay = 300) => {
    if (target === prevEmotionRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      prevEmotionRef.current = target
      setEmotion(target)
      timerRef.current = null
    }, delay)
  }, [])

  // Phase-driven emotion selection
  useEffect(() => {
    if (ambientTimerRef.current) {
      clearTimeout(ambientTimerRef.current)
      ambientTimerRef.current = null
    }

    phaseRef.current = currentPhase

    if (currentPhase === 'error') {
      setEmotionDebounced('concerned', 150)
      return
    }

    if (currentPhase === 'tools') {
      setEmotionDebounced('processing', 200)
      return
    }

    // For thinking, streaming, and idle — start ambient cycling
    const pool =
      currentPhase === 'thinking'
        ? THINKING_EMOTIONS
        : currentPhase === 'streaming'
          ? STREAMING_EMOTIONS
          : AMBIENT_EMOTIONS

    const interval =
      currentPhase === 'thinking'
        ? 2500  // Cycle faster while thinking
        : currentPhase === 'streaming'
          ? 3500  // Moderate during streaming
          : 5000  // Slow ambient when idle

    // Set initial emotion for this phase
    ambientIndexRef.current = 0
    setEmotionDebounced(pool[0], currentPhase === 'idle' ? 300 : 150)

    // Start cycling
    const cycle = () => {
      ambientIndexRef.current = (ambientIndexRef.current + 1) % pool.length
      const next = pool[ambientIndexRef.current]
      prevEmotionRef.current = next
      setEmotion(next)
      ambientTimerRef.current = setTimeout(cycle, interval + Math.random() * 1500)
    }

    ambientTimerRef.current = setTimeout(cycle, interval + Math.random() * 1000)

    return () => {
      if (ambientTimerRef.current) clearTimeout(ambientTimerRef.current)
    }
  }, [currentPhase, setEmotionDebounced])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (ambientTimerRef.current) clearTimeout(ambientTimerRef.current)
    }
  }, [])

  return emotion
}
