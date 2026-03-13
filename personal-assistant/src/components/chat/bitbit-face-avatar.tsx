'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { AvatarEmotion } from './use-avatar-emotion'

interface BitBitFaceAvatarProps {
  size?: number
  emotion?: AvatarEmotion
  isThinking?: boolean
  className?: string
}

// ─── Face geometry ───
// Eyes wider apart (cx 13/35 vs old 16/32), smaller (r=2 vs 2.5)
// Nose lower (y=24-30 vs old 22-28) for more space between eyes and nose
const LEFT_EYE_CX = 13
const RIGHT_EYE_CX = 35
const EYE_CY = 20
const EYE_R = 2
const NOSE_PATH = 'M24 24 L24 30 L27 30'

// Emotion config
const EMOTION_CONFIG: Record<
  AvatarEmotion,
  {
    leftEye: { cx: number; scaleX: number; scaleY: number }
    rightEye: { cx: number; scaleX: number; scaleY: number }
    leftBrow: { dy: number; rotate: number }
    rightBrow: { dy: number; rotate: number }
    nose: { dy: number; rotate: number }
  }
> = {
  neutral: {
    leftEye: { cx: 0, scaleX: 1, scaleY: 1 },
    rightEye: { cx: 0, scaleX: 1, scaleY: 1 },
    leftBrow: { dy: 0, rotate: 0 },
    rightBrow: { dy: 0, rotate: 0 },
    nose: { dy: 0, rotate: 0 },
  },
  thinking: {
    leftEye: { cx: -1, scaleX: 1, scaleY: 1 },
    rightEye: { cx: -1, scaleX: 1, scaleY: 1 },
    leftBrow: { dy: -2, rotate: 0 },
    rightBrow: { dy: -2, rotate: 0 },
    nose: { dy: 0, rotate: 0 },
  },
  curious: {
    leftEye: { cx: 0.5, scaleX: 1.15, scaleY: 1.15 },
    rightEye: { cx: 0.5, scaleX: 1.15, scaleY: 1.15 },
    leftBrow: { dy: -3, rotate: -6 },
    rightBrow: { dy: -1, rotate: 4 },
    nose: { dy: 0, rotate: 2 },
  },
  happy: {
    leftEye: { cx: 0, scaleX: 1.05, scaleY: 0.6 },
    rightEye: { cx: 0, scaleX: 1.05, scaleY: 0.6 },
    leftBrow: { dy: 1, rotate: -3 },
    rightBrow: { dy: 1, rotate: 3 },
    nose: { dy: 0.3, rotate: 0 },
  },
  concerned: {
    leftEye: { cx: 0, scaleX: 0.9, scaleY: 0.9 },
    rightEye: { cx: 0, scaleX: 0.9, scaleY: 0.9 },
    leftBrow: { dy: -1, rotate: 10 },
    rightBrow: { dy: -1, rotate: -10 },
    nose: { dy: 0, rotate: -2 },
  },
  focused: {
    leftEye: { cx: 0, scaleX: 1, scaleY: 0.75 },
    rightEye: { cx: 0, scaleX: 1, scaleY: 0.75 },
    leftBrow: { dy: 2, rotate: 2 },
    rightBrow: { dy: 2, rotate: -2 },
    nose: { dy: 0, rotate: 0 },
  },
  surprised: {
    leftEye: { cx: 0, scaleX: 1.35, scaleY: 1.35 },
    rightEye: { cx: 0, scaleX: 1.35, scaleY: 1.35 },
    leftBrow: { dy: -4, rotate: 0 },
    rightBrow: { dy: -4, rotate: 0 },
    nose: { dy: 0.5, rotate: 0 },
  },
  processing: {
    leftEye: { cx: 0, scaleX: 1, scaleY: 1 },
    rightEye: { cx: 0, scaleX: 1, scaleY: 1 },
    leftBrow: { dy: -1, rotate: 0 },
    rightBrow: { dy: -1, rotate: 0 },
    nose: { dy: 0, rotate: 0 },
  },
  contemplating: {
    leftEye: { cx: 1.5, scaleX: 1, scaleY: 0.9 },
    rightEye: { cx: 1.5, scaleX: 1, scaleY: 1.05 },
    leftBrow: { dy: -1, rotate: 3 },
    rightBrow: { dy: -2, rotate: -2 },
    nose: { dy: 0, rotate: 3 },
  },
  amused: {
    leftEye: { cx: 0, scaleX: 1.1, scaleY: 0.55 },
    rightEye: { cx: 0, scaleX: 1.1, scaleY: 0.7 },
    leftBrow: { dy: 0, rotate: -5 },
    rightBrow: { dy: -1, rotate: 5 },
    nose: { dy: 0.3, rotate: 0 },
  },
  determined: {
    leftEye: { cx: 0, scaleX: 1.05, scaleY: 0.7 },
    rightEye: { cx: 0, scaleX: 1.05, scaleY: 0.7 },
    leftBrow: { dy: 2, rotate: 6 },
    rightBrow: { dy: 2, rotate: -6 },
    nose: { dy: 0, rotate: 0 },
  },
  skeptical: {
    leftEye: { cx: 0, scaleX: 1, scaleY: 1.1 },
    rightEye: { cx: 0, scaleX: 0.95, scaleY: 0.75 },
    leftBrow: { dy: -2, rotate: -8 },
    rightBrow: { dy: 1, rotate: 5 },
    nose: { dy: 0, rotate: -3 },
  },
  excited: {
    leftEye: { cx: 0, scaleX: 1.25, scaleY: 1.25 },
    rightEye: { cx: 0, scaleX: 1.25, scaleY: 1.25 },
    leftBrow: { dy: -3.5, rotate: -4 },
    rightBrow: { dy: -3.5, rotate: 4 },
    nose: { dy: 0, rotate: 0 },
  },
  drowsy: {
    leftEye: { cx: 0, scaleX: 1, scaleY: 0.35 },
    rightEye: { cx: 0, scaleX: 1, scaleY: 0.4 },
    leftBrow: { dy: 2.5, rotate: 3 },
    rightBrow: { dy: 2.5, rotate: -3 },
    nose: { dy: 0.5, rotate: 0 },
  },
  alert: {
    leftEye: { cx: 0, scaleX: 1.2, scaleY: 1.2 },
    rightEye: { cx: 0, scaleX: 1.2, scaleY: 1.2 },
    leftBrow: { dy: -2.5, rotate: 0 },
    rightBrow: { dy: -2.5, rotate: 0 },
    nose: { dy: 0, rotate: 0 },
  },
  mischievous: {
    leftEye: { cx: 0.5, scaleX: 1, scaleY: 0.65 },
    rightEye: { cx: 0.5, scaleX: 1.1, scaleY: 1 },
    leftBrow: { dy: 1, rotate: 8 },
    rightBrow: { dy: -2.5, rotate: -3 },
    nose: { dy: 0, rotate: 3 },
  },
  serene: {
    leftEye: { cx: 0, scaleX: 1, scaleY: 0.5 },
    rightEye: { cx: 0, scaleX: 1, scaleY: 0.5 },
    leftBrow: { dy: 1, rotate: -2 },
    rightBrow: { dy: 1, rotate: 2 },
    nose: { dy: 0.2, rotate: 0 },
  },
  confused: {
    leftEye: { cx: -0.5, scaleX: 1.15, scaleY: 1.15 },
    rightEye: { cx: 0.5, scaleX: 0.9, scaleY: 0.9 },
    leftBrow: { dy: -2.5, rotate: -10 },
    rightBrow: { dy: 0, rotate: 8 },
    nose: { dy: 0, rotate: -3 },
  },
  proud: {
    leftEye: { cx: 0, scaleX: 1, scaleY: 0.65 },
    rightEye: { cx: 0, scaleX: 1, scaleY: 0.65 },
    leftBrow: { dy: -1.5, rotate: -5 },
    rightBrow: { dy: -1.5, rotate: 5 },
    nose: { dy: -0.3, rotate: 0 },
  },
  attentive: {
    leftEye: { cx: 0, scaleX: 1.1, scaleY: 1.1 },
    rightEye: { cx: 0, scaleX: 1.1, scaleY: 1.1 },
    leftBrow: { dy: -1.5, rotate: 0 },
    rightBrow: { dy: -1.5, rotate: 0 },
    nose: { dy: 0, rotate: 0 },
  },
  annoyed: {
    leftEye: { cx: 0, scaleX: 0.85, scaleY: 0.5 },
    rightEye: { cx: 0, scaleX: 0.85, scaleY: 0.5 },
    leftBrow: { dy: 3, rotate: 12 },
    rightBrow: { dy: 3, rotate: -12 },
    nose: { dy: 0, rotate: -5 },
  },
  sleeping: {
    leftEye: { cx: 0, scaleX: 1.1, scaleY: 0.08 },
    rightEye: { cx: 0, scaleX: 1.1, scaleY: 0.08 },
    leftBrow: { dy: 3.5, rotate: 4 },
    rightBrow: { dy: 3.5, rotate: -4 },
    nose: { dy: 0.8, rotate: 0 },
  },
  startled: {
    leftEye: { cx: 0, scaleX: 1.5, scaleY: 1.5 },
    rightEye: { cx: 0, scaleX: 1.5, scaleY: 1.5 },
    leftBrow: { dy: -5, rotate: -3 },
    rightBrow: { dy: -5, rotate: 3 },
    nose: { dy: 0.8, rotate: 0 },
  },
  bored: {
    leftEye: { cx: 1.5, scaleX: 1, scaleY: 0.55 },
    rightEye: { cx: 1.5, scaleX: 1, scaleY: 0.6 },
    leftBrow: { dy: 2, rotate: 2 },
    rightBrow: { dy: 2, rotate: -2 },
    nose: { dy: 0.3, rotate: 2 },
  },
  patient: {
    leftEye: { cx: 0, scaleX: 1, scaleY: 0.85 },
    rightEye: { cx: 0, scaleX: 1, scaleY: 0.85 },
    leftBrow: { dy: 0.5, rotate: -1 },
    rightBrow: { dy: 0.5, rotate: 1 },
    nose: { dy: 0.1, rotate: 0 },
  },
  impressed: {
    leftEye: { cx: 0, scaleX: 1.3, scaleY: 1.3 },
    rightEye: { cx: 0, scaleX: 1.3, scaleY: 1.3 },
    leftBrow: { dy: -3.5, rotate: -2 },
    rightBrow: { dy: -3.5, rotate: 2 },
    nose: { dy: 0, rotate: 0 },
  },
  relieved: {
    leftEye: { cx: 0, scaleX: 1.05, scaleY: 0.45 },
    rightEye: { cx: 0, scaleX: 1.05, scaleY: 0.45 },
    leftBrow: { dy: 1.5, rotate: -4 },
    rightBrow: { dy: 1.5, rotate: 4 },
    nose: { dy: 0.4, rotate: 0 },
  },
  shy: {
    leftEye: { cx: -1, scaleX: 0.9, scaleY: 0.7 },
    rightEye: { cx: -1, scaleX: 1, scaleY: 0.85 },
    leftBrow: { dy: 0, rotate: 5 },
    rightBrow: { dy: -1.5, rotate: -3 },
    nose: { dy: 0, rotate: -4 },
  },
  playful: {
    leftEye: { cx: 0.5, scaleX: 1.2, scaleY: 1.2 },
    rightEye: { cx: 0.5, scaleX: 0.9, scaleY: 0.6 },
    leftBrow: { dy: -2, rotate: -6 },
    rightBrow: { dy: 0, rotate: 4 },
    nose: { dy: 0, rotate: 4 },
  },
  suspicious: {
    leftEye: { cx: 1, scaleX: 0.9, scaleY: 0.55 },
    rightEye: { cx: 1, scaleX: 1.1, scaleY: 1 },
    leftBrow: { dy: 1.5, rotate: 6 },
    rightBrow: { dy: -2, rotate: -2 },
    nose: { dy: 0, rotate: -2 },
  },
  zen: {
    leftEye: { cx: 0, scaleX: 1, scaleY: 0.12 },
    rightEye: { cx: 0, scaleX: 1, scaleY: 0.12 },
    leftBrow: { dy: 2, rotate: -3 },
    rightBrow: { dy: 2, rotate: 3 },
    nose: { dy: 0.3, rotate: 0 },
  },
}

const TRANSITION = { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] as const }
const BLINK_TRANSITION = { duration: 0.15, ease: 'easeInOut' as const }

// Thinking eye scanning
const THINKING_EYE_SCAN_X = [-1.5, 0.5, 2, 1, -0.5, -1.5]
const THINKING_EYE_SCAN_Y = [-0.8, -0.3, -0.7, 0.2, -0.4, -0.8]
const THINKING_EYE_TRANSITION = {
  translateX: { duration: 5, repeat: Infinity, ease: 'easeInOut' as const },
  translateY: { duration: 5, repeat: Infinity, ease: 'easeInOut' as const },
}

const THINKING_BROW_LEFT = {
  dy: [-2, -3, -1.5, -2.5, -2],
  rotate: [0, -3, 2, -1, 0],
}
const THINKING_BROW_RIGHT = {
  dy: [-2, -1.5, -3, -2, -2],
  rotate: [0, 2, -2, 3, 0],
}
const THINKING_BROW_TRANSITION = {
  translateY: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const },
  rotate: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const },
}

export function BitBitFaceAvatar({
  size = 48,
  emotion = 'neutral',
  isThinking = false,
  className = '',
}: BitBitFaceAvatarProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 })
  const [headTilt, setHeadTilt] = useState(0)
  const [isBlinking, setIsBlinking] = useState(false)
  const [isSniffling, setIsSniffling] = useState(false)
  const rafRef = useRef<number | null>(null)
  const lastUpdateRef = useRef(0)
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sniffleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cursor tracking
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const now = Date.now()
    if (now - lastUpdateRef.current < 50) return
    lastUpdateRef.current = now

    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    rafRef.current = requestAnimationFrame(() => {
      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      const dx = e.clientX - centerX
      const dy = e.clientY - centerY
      const distance = Math.sqrt(dx * dx + dy * dy)

      const maxDisplace = 1.5
      const factor = Math.min(distance / 300, 1)
      const angle = Math.atan2(dy, dx)

      setEyeOffset({
        x: Math.cos(angle) * factor * maxDisplace,
        y: Math.sin(angle) * factor * maxDisplace * 0.6,
      })

      setHeadTilt((dx / window.innerWidth) * 3)
    })
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [handleMouseMove])

  // Periodic blinking
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 4000
      blinkTimerRef.current = setTimeout(() => {
        setIsBlinking(true)
        setTimeout(() => {
          setIsBlinking(false)
          scheduleBlink()
        }, 150)
      }, delay)
    }

    scheduleBlink()
    return () => {
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current)
    }
  }, [])

  // Idle nose sniffle — occasional quick nose twitch
  useEffect(() => {
    const scheduleSniffle = () => {
      // Random interval: 12-25s between sniffles
      const delay = 12000 + Math.random() * 13000
      sniffleTimerRef.current = setTimeout(() => {
        // Only sniffle in calm states
        const calmEmotions: AvatarEmotion[] = ['neutral', 'serene', 'patient', 'bored', 'contemplating', 'attentive']
        if (calmEmotions.includes(emotion)) {
          setIsSniffling(true)
          setTimeout(() => {
            setIsSniffling(false)
            scheduleSniffle()
          }, 300)
        } else {
          scheduleSniffle()
        }
      }, delay)
    }

    scheduleSniffle()
    return () => {
      if (sniffleTimerRef.current) clearTimeout(sniffleTimerRef.current)
    }
  }, [emotion])

  const config = EMOTION_CONFIG[emotion]
  const color = 'var(--text-primary, #fff)'

  const isProcessing = emotion === 'processing'
  const isSleeping = emotion === 'sleeping'

  const effectiveEyeOffset = isThinking ? { x: 0, y: 0 } : eyeOffset
  const blinkScaleY = isBlinking ? 0.15 : undefined

  // Nose sniffle animation values
  const noseTranslateY = isSniffling
    ? [0, -0.8, 0.3, -0.4, 0]
    : isThinking
      ? [0, 0.2, -0.1, 0.1, 0]
      : config.nose.dy
  const noseRotate = isSniffling
    ? [0, 3, -2, 1, 0]
    : isThinking
      ? [0, 2, -1, 1.5, 0]
      : config.nose.rotate
  const noseTransition = isSniffling
    ? { translateY: { duration: 0.3, ease: 'easeInOut' as const }, rotate: { duration: 0.3, ease: 'easeInOut' as const } }
    : isThinking
      ? {
          translateY: { duration: 6, repeat: Infinity, ease: 'easeInOut' as const },
          rotate: { duration: 6, repeat: Infinity, ease: 'easeInOut' as const },
          ...TRANSITION,
        }
      : TRANSITION

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`bb-chat__face-avatar ${size > 48 ? 'bb-chat__face-avatar--large' : ''} ${className}`}
      style={{ overflow: 'visible' }}
    >
      <motion.g
        animate={{ rotate: headTilt }}
        transition={{ duration: 0.15, ease: 'linear' }}
        style={{ transformOrigin: '50% 50%' }}
      >
        {/* Ambient breathing */}
        <motion.g
          animate={{
            scale: [1, 1.015, 1],
            translateY: [0, -0.3, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ transformOrigin: '50% 50%' }}
        >
          {/* Left eyebrow — wider to match new eye positions */}
          <motion.path
            d="M10 14 Q13.5 10 17 14"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            animate={{
              translateY: isThinking ? THINKING_BROW_LEFT.dy : config.leftBrow.dy,
              rotate: isThinking ? THINKING_BROW_LEFT.rotate : config.leftBrow.rotate,
            }}
            transition={isThinking ? { ...THINKING_BROW_TRANSITION, ...TRANSITION } : TRANSITION}
            style={{ transformOrigin: '50% 50%' }}
          />

          {/* Right eyebrow */}
          <motion.path
            d="M31 14 Q34.5 10 38 14"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            animate={{
              translateY: isThinking ? THINKING_BROW_RIGHT.dy : config.rightBrow.dy,
              rotate: isThinking ? THINKING_BROW_RIGHT.rotate : config.rightBrow.rotate,
            }}
            transition={isThinking ? { ...THINKING_BROW_TRANSITION, ...TRANSITION } : TRANSITION}
            style={{ transformOrigin: '50% 50%' }}
          />

          {/* Left eye */}
          <motion.circle
            cx={LEFT_EYE_CX}
            cy={EYE_CY}
            r={EYE_R}
            fill={color}
            animate={{
              translateX: isThinking
                ? THINKING_EYE_SCAN_X
                : isProcessing
                  ? [0, 2, -2, 0]
                  : config.leftEye.cx + effectiveEyeOffset.x,
              translateY: isThinking
                ? THINKING_EYE_SCAN_Y
                : effectiveEyeOffset.y,
              scaleX: config.leftEye.scaleX,
              scaleY: blinkScaleY ?? config.leftEye.scaleY,
            }}
            transition={
              isBlinking
                ? BLINK_TRANSITION
                : isThinking
                  ? { ...THINKING_EYE_TRANSITION, ...TRANSITION }
                  : isProcessing
                    ? { translateX: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }, ...TRANSITION }
                    : TRANSITION
            }
            style={{ transformOrigin: '50% 50%' }}
          />

          {/* Right eye */}
          <motion.circle
            cx={RIGHT_EYE_CX}
            cy={EYE_CY}
            r={EYE_R}
            fill={color}
            animate={{
              translateX: isThinking
                ? THINKING_EYE_SCAN_X
                : isProcessing
                  ? [0, 2, -2, 0]
                  : config.rightEye.cx + effectiveEyeOffset.x,
              translateY: isThinking
                ? THINKING_EYE_SCAN_Y
                : effectiveEyeOffset.y,
              scaleX: config.rightEye.scaleX,
              scaleY: blinkScaleY ?? config.rightEye.scaleY,
            }}
            transition={
              isBlinking
                ? BLINK_TRANSITION
                : isThinking
                  ? {
                      ...THINKING_EYE_TRANSITION,
                      translateX: { ...THINKING_EYE_TRANSITION.translateX, delay: 0.15 },
                      ...TRANSITION,
                    }
                  : isProcessing
                    ? { translateX: { duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }, ...TRANSITION }
                    : TRANSITION
            }
            style={{ transformOrigin: '50% 50%' }}
          />

          {/* L-shaped nose — lower, with sniffle support */}
          <motion.path
            d={NOSE_PATH}
            stroke={color}
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            animate={{
              translateY: noseTranslateY,
              rotate: noseRotate,
            }}
            transition={noseTransition}
            style={{ transformOrigin: '50% 50%' }}
          />

          {/* ─── Sleep Z's ─── */}
          <AnimatePresence>
            {isSleeping && (
              <>
                {/* Z 1 — small, close */}
                <motion.text
                  key="z1"
                  x={38}
                  y={12}
                  fill={color}
                  fontSize="5"
                  fontWeight="bold"
                  fontFamily="sans-serif"
                  initial={{ opacity: 0, y: 0, x: 0 }}
                  animate={{
                    opacity: [0, 0.6, 0.5, 0],
                    y: [0, -6, -12, -18],
                    x: [0, 2, 4, 5],
                  }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeOut',
                  }}
                >
                  z
                </motion.text>

                {/* Z 2 — medium, staggered */}
                <motion.text
                  key="z2"
                  x={40}
                  y={10}
                  fill={color}
                  fontSize="7"
                  fontWeight="bold"
                  fontFamily="sans-serif"
                  initial={{ opacity: 0, y: 0, x: 0 }}
                  animate={{
                    opacity: [0, 0.45, 0.4, 0],
                    y: [0, -8, -16, -24],
                    x: [0, 3, 5, 7],
                  }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 3.5,
                    repeat: Infinity,
                    ease: 'easeOut',
                    delay: 1,
                  }}
                >
                  z
                </motion.text>

                {/* Z 3 — large, furthest */}
                <motion.text
                  key="z3"
                  x={42}
                  y={8}
                  fill={color}
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="sans-serif"
                  initial={{ opacity: 0, y: 0, x: 0 }}
                  animate={{
                    opacity: [0, 0.35, 0.3, 0],
                    y: [0, -10, -20, -30],
                    x: [0, 4, 7, 9],
                  }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: 'easeOut',
                    delay: 2,
                  }}
                >
                  Z
                </motion.text>
              </>
            )}
          </AnimatePresence>

        </motion.g>
      </motion.g>
    </svg>
  )
}
