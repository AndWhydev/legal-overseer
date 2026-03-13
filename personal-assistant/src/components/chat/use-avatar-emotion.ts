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
  // Extended library
  | 'sleeping'
  | 'startled'
  | 'bored'
  | 'patient'
  | 'impressed'
  | 'relieved'
  | 'shy'
  | 'playful'
  | 'suspicious'
  | 'zen'

interface UseAvatarEmotionInput {
  isThinking: boolean
  isToolRunning: boolean
  isStreaming: boolean
  hasError: boolean
}

// ─── Emotion pools per scenario ───

const AMBIENT_DAYTIME: AvatarEmotion[] = [
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

// Late night (11pm-5am) — more sleepy/chill vibes
const AMBIENT_NIGHTTIME: AvatarEmotion[] = [
  'neutral',
  'serene',
  'zen',
  'neutral',
  'drowsy',
  'serene',
  'neutral',
  'zen',
  'neutral',
  'contemplating',
  'neutral',
  'serene',
]

// Thinking — expressive variety
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
  'impressed',
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
  'playful',
  'happy',
]

// Post-response — waiting for user, gradually less engaged
const POST_RESPONSE_EMOTIONS: AvatarEmotion[] = [
  'happy',
  'patient',
  'serene',
  'patient',
  'neutral',
  'patient',
  'bored',
  'neutral',
  'contemplating',
  'curious',
  'bored',
  'neutral',
]

// Sleep approach — progressive drowsiness
const SLEEP_APPROACH: AvatarEmotion[] = [
  'drowsy',
  'serene',
  'drowsy',
  'zen',
  'sleeping',
]

// Wake-up sequence when cursor returns after sleep
const WAKE_SEQUENCE: AvatarEmotion[] = [
  'startled',
  'alert',
  'confused',
  'neutral',
]

/**
 * Maps SSE event phases to face emotion states with smooth debounced
 * transitions, ambient cycling, sleep/wake detection, and cursor
 * harassment easter egg.
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

  // Cursor harassment tracking
  const cursorEventsRef = useRef<number[]>([])
  const isIrritatedRef = useRef(false)
  const irritationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sleep/wake tracking
  const lastMouseMoveRef = useRef(Date.now())
  const sleepStageRef = useRef(0) // 0=awake, 1=drowsy, 2=sleeping
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wakeSequenceRef = useRef(false)
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Post-response tracking
  const wasStreamingRef = useRef(false)
  const postResponseRef = useRef(false)

  // Previous error state for relief detection
  const prevErrorRef = useRef(false)

  const currentPhase = hasError
    ? 'error'
    : isThinking
      ? 'thinking'
      : isToolRunning
        ? 'tools'
        : isStreaming
          ? 'streaming'
          : 'idle'

  const setEmotionSmooth = useCallback((target: AvatarEmotion, delay = 400) => {
    if (target === prevEmotionRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      prevEmotionRef.current = target
      setEmotion(target)
      timerRef.current = null
    }, delay)
  }, [])

  // Direct emotion set (no debounce, for immediate reactions)
  const setEmotionDirect = useCallback((target: AvatarEmotion) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    prevEmotionRef.current = target
    setEmotion(target)
  }, [])

  // ─── Sleep/wake detection ───
  useEffect(() => {
    if (currentPhase !== 'idle') {
      // Reset sleep when active
      sleepStageRef.current = 0
      lastMouseMoveRef.current = Date.now()
      if (sleepTimerRef.current) {
        clearTimeout(sleepTimerRef.current)
        sleepTimerRef.current = null
      }
      return
    }

    const handleMouseMove = () => {
      lastMouseMoveRef.current = Date.now()

      // Wake up if sleeping
      if (sleepStageRef.current > 0 && !wakeSequenceRef.current) {
        wakeSequenceRef.current = true
        sleepStageRef.current = 0

        // Clear ambient cycling
        if (ambientTimerRef.current) {
          clearTimeout(ambientTimerRef.current)
          ambientTimerRef.current = null
        }

        // Play wake-up sequence
        let step = 0
        const playWake = () => {
          if (step < WAKE_SEQUENCE.length) {
            setEmotionDirect(WAKE_SEQUENCE[step])
            step++
            wakeTimerRef.current = setTimeout(playWake, step === 1 ? 400 : 800)
          } else {
            wakeSequenceRef.current = false
            wakeTimerRef.current = null
          }
        }
        playWake()
      }
    }

    // Check for inactivity periodically
    const checkSleep = () => {
      if (currentPhase !== 'idle' || isIrritatedRef.current || wakeSequenceRef.current) return

      const idleMs = Date.now() - lastMouseMoveRef.current

      if (idleMs > 40000 && sleepStageRef.current < 2) {
        // Deep sleep
        sleepStageRef.current = 2
        if (ambientTimerRef.current) {
          clearTimeout(ambientTimerRef.current)
          ambientTimerRef.current = null
        }
        setEmotionSmooth('sleeping', 600)
      } else if (idleMs > 20000 && sleepStageRef.current < 1) {
        // Getting drowsy
        sleepStageRef.current = 1
        if (ambientTimerRef.current) {
          clearTimeout(ambientTimerRef.current)
          ambientTimerRef.current = null
        }
        // Progressive drowsiness
        let idx = 0
        const driftOff = () => {
          if (sleepStageRef.current < 1) return // Was woken
          if (idx < SLEEP_APPROACH.length) {
            setEmotionDirect(SLEEP_APPROACH[idx])
            idx++
            ambientTimerRef.current = setTimeout(driftOff, 4000 + Math.random() * 2000)
          }
        }
        driftOff()
      }

      sleepTimerRef.current = setTimeout(checkSleep, 5000)
    }

    document.addEventListener('mousemove', handleMouseMove)
    sleepTimerRef.current = setTimeout(checkSleep, 5000)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current)
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current)
    }
  }, [currentPhase, setEmotionSmooth, setEmotionDirect])

  // ─── Post-error relief ───
  useEffect(() => {
    if (prevErrorRef.current && !hasError && currentPhase === 'idle') {
      setEmotionDirect('relieved')
      setTimeout(() => {
        if (prevEmotionRef.current === 'relieved') {
          setEmotionSmooth('neutral', 800)
        }
      }, 2000)
    }
    prevErrorRef.current = hasError
  }, [hasError, currentPhase, setEmotionDirect, setEmotionSmooth])

  // ─── Post-response detection ───
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true
      postResponseRef.current = false
    } else if (wasStreamingRef.current && currentPhase === 'idle') {
      wasStreamingRef.current = false
      postResponseRef.current = true
      // Post-response state lasts ~30s before reverting to normal ambient
      setTimeout(() => {
        postResponseRef.current = false
      }, 30000)
    }
  }, [isStreaming, currentPhase])

  // ─── Cursor harassment Easter egg ───
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (currentPhase !== 'idle') {
        cursorEventsRef.current = []
        return
      }

      const target = e.target as Element
      const avatar = target.closest?.('.bb-chat__face-avatar')
      if (!avatar) {
        if (cursorEventsRef.current.length > 0) {
          cursorEventsRef.current = cursorEventsRef.current.filter(
            t => Date.now() - t < 3000
          )
        }
        return
      }

      const now = Date.now()
      cursorEventsRef.current.push(now)
      cursorEventsRef.current = cursorEventsRef.current.filter(t => now - t < 3000)

      if (cursorEventsRef.current.length > 15 && !isIrritatedRef.current) {
        isIrritatedRef.current = true
        setEmotionDirect('annoyed')

        if (ambientTimerRef.current) {
          clearTimeout(ambientTimerRef.current)
          ambientTimerRef.current = null
        }

        if (irritationTimerRef.current) clearTimeout(irritationTimerRef.current)
        irritationTimerRef.current = setTimeout(() => {
          setEmotionDirect('skeptical')
          irritationTimerRef.current = setTimeout(() => {
            isIrritatedRef.current = false
            cursorEventsRef.current = []
            setEmotionSmooth('neutral', 500)
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
  }, [currentPhase, setEmotionDirect, setEmotionSmooth])

  // ─── Phase-driven emotion cycling ───
  useEffect(() => {
    if (isIrritatedRef.current || wakeSequenceRef.current || sleepStageRef.current > 0) return

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

    // Choose emotion pool based on phase and context
    let pool: AvatarEmotion[]
    let interval: number

    if (currentPhase === 'thinking') {
      pool = THINKING_EMOTIONS
      interval = 2000
    } else if (currentPhase === 'streaming') {
      pool = STREAMING_EMOTIONS
      interval = 3500
    } else if (postResponseRef.current) {
      pool = POST_RESPONSE_EMOTIONS
      interval = 4000
    } else {
      // Check time of day for ambient pool
      const hour = new Date().getHours()
      const isNighttime = hour >= 23 || hour < 5
      pool = isNighttime ? AMBIENT_NIGHTTIME : AMBIENT_DAYTIME
      interval = isNighttime ? 7000 : 6000
    }

    ambientIndexRef.current = 0
    setEmotionSmooth(pool[0], currentPhase === 'idle' ? 500 : 250)

    const cycle = () => {
      if (isIrritatedRef.current || wakeSequenceRef.current || sleepStageRef.current > 0) return
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
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current)
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current)
    }
  }, [])

  return emotion
}
