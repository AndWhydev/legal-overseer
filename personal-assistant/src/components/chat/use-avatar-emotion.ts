'use client'

import { useRef, useState, useEffect } from 'react'

export type AvatarEmotion =
  | 'neutral'
  | 'thinking'
  | 'curious'
  | 'happy'
  | 'concerned'
  | 'focused'
  | 'surprised'
  | 'processing'

interface UseAvatarEmotionInput {
  isThinking: boolean
  isToolRunning: boolean
  isStreaming: boolean
  hasError: boolean
}

/**
 * Maps SSE event phases to face emotion states with debounce
 * to prevent rapid flickering between emotions.
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

  useEffect(() => {
    let target: AvatarEmotion = 'neutral'

    if (hasError) {
      target = 'concerned'
    } else if (isThinking) {
      target = 'thinking'
    } else if (isToolRunning) {
      target = 'processing'
    } else if (isStreaming) {
      target = 'happy'
    }

    // Skip if same as current displayed emotion
    if (target === prevEmotionRef.current) return

    // Clear any pending transition
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    // Debounce transition to prevent rapid flickering (300ms)
    timerRef.current = setTimeout(() => {
      prevEmotionRef.current = target
      setEmotion(target)
      timerRef.current = null
    }, 300)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [isThinking, isToolRunning, isStreaming, hasError])

  return emotion
}
