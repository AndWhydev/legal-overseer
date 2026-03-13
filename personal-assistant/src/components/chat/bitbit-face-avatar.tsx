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

// Emotion config — eyes use only scale (no cy displacement) to avoid
// transform-origin conflicts with cursor tracking and blink scaleY.
// Expression comes from eye shape (scaleX/Y) + eyebrow position + nose.
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
}

const TRANSITION = { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const }
const BLINK_TRANSITION = { duration: 0.15, ease: 'easeInOut' as const }

// Thinking eye scanning — contemplative left-right-up gaze pattern
const THINKING_EYE_SCAN_X = [-1.5, 0.5, 2, 1, -0.5, -1.5]
const THINKING_EYE_SCAN_Y = [-0.8, -0.3, -0.7, 0.2, -0.4, -0.8]
const THINKING_EYE_TRANSITION = {
  translateX: { duration: 5, repeat: Infinity, ease: 'easeInOut' as const },
  translateY: { duration: 5, repeat: Infinity, ease: 'easeInOut' as const },
}

// Thinking eyebrow rhythm — subtle contemplative movement
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

// Face center for orbiting effects (between eyes and nose)
const FACE_CX = 24
const FACE_CY = 22

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
  const rafRef = useRef<number | null>(null)
  const lastUpdateRef = useRef(0)
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cursor tracking for eyes + subtle head tilt
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
        y: Math.sin(angle) * factor * maxDisplace * 0.6, // less vertical range
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

  // Periodic blinking — natural interval with randomness
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 4000 // 2.5-6.5s between blinks
      blinkTimerRef.current = setTimeout(() => {
        setIsBlinking(true)
        // Blink lasts ~150ms
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

  const config = EMOTION_CONFIG[emotion]
  const color = 'var(--text-primary, #fff)'

  const isProcessing = emotion === 'processing'

  // When thinking, override cursor tracking — eyes scan autonomously
  const effectiveEyeOffset = isThinking ? { x: 0, y: 0 } : eyeOffset

  // Blink overrides eye scaleY — 0.15 keeps eyes visually anchored
  const blinkScaleY = isBlinking ? 0.15 : undefined

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
      {/* SVG defs for thinking glow effects */}
      <defs>
        <radialGradient id="thinking-glow" cx="50%" cy="46%" r="50%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
      </defs>

      <motion.g
        animate={{ rotate: headTilt }}
        transition={{ duration: 0.15, ease: 'linear' }}
        style={{ transformOrigin: '50% 50%' }}
      >
        {/* Ambient breathing — subtle scale pulse on the whole face */}
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
          {/* === THINKING BACKGROUND EFFECTS === */}
          <AnimatePresence>
            {isThinking && (
              <motion.g
                key="thinking-bg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ opacity: { duration: 0.5 } }}
              >
                {/* Ambient glow behind face */}
                <motion.circle
                  cx={FACE_CX}
                  cy={FACE_CY}
                  r={16}
                  fill="url(#thinking-glow)"
                  animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ transformOrigin: `${FACE_CX}px ${FACE_CY}px` }}
                />

                {/* Pulse ring 1 — emerald */}
                <motion.circle
                  cx={FACE_CX}
                  cy={FACE_CY}
                  r={12}
                  stroke="#10b981"
                  strokeWidth={0.6}
                  fill="none"
                  animate={{ scale: [0.8, 2], opacity: [0.5, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
                  style={{ transformOrigin: `${FACE_CX}px ${FACE_CY}px` }}
                />

                {/* Pulse ring 2 — cyan, staggered */}
                <motion.circle
                  cx={FACE_CX}
                  cy={FACE_CY}
                  r={12}
                  stroke="#06b6d4"
                  strokeWidth={0.4}
                  fill="none"
                  animate={{ scale: [0.8, 2.2], opacity: [0.35, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 1.25 }}
                  style={{ transformOrigin: `${FACE_CX}px ${FACE_CY}px` }}
                />
              </motion.g>
            )}
          </AnimatePresence>

          {/* Left eyebrow */}
          <motion.path
            d="M13 14 Q16.5 10 20 14"
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
            d="M28 14 Q31.5 10 35 14"
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

          {/* Left eye — scale from element center (50% 50%), translate for cursor */}
          <motion.circle
            cx={16}
            cy={20}
            r="2.5"
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
            cx={32}
            cy={20}
            r="2.5"
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

          {/* L-shaped nose */}
          <motion.path
            d="M24 22 L24 28 L27 28"
            stroke={color}
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            animate={{
              translateY: isThinking ? [0, 0.2, -0.1, 0.1, 0] : config.nose.dy,
              rotate: isThinking ? [0, 2, -1, 1.5, 0] : config.nose.rotate,
            }}
            transition={
              isThinking
                ? {
                    translateY: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
                    rotate: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
                    ...TRANSITION,
                  }
                : TRANSITION
            }
            style={{ transformOrigin: '50% 50%' }}
          />

          {/* === THINKING FOREGROUND EFFECTS === */}
          <AnimatePresence>
            {isThinking && (
              <motion.g
                key="thinking-fg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ opacity: { duration: 0.5 } }}
              >
                {/* Orbit 1 — emerald dot, fast clockwise */}
                <motion.g
                  animate={{ rotate: 360 }}
                  transition={{ rotate: { duration: 3, repeat: Infinity, ease: 'linear' } }}
                  style={{ transformOrigin: `${FACE_CX}px ${FACE_CY}px` }}
                >
                  <motion.circle
                    cx={FACE_CX}
                    cy={FACE_CY - 16}
                    r={1.3}
                    fill="#10b981"
                    animate={{ opacity: [0.4, 0.9, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  {/* Faint trail dot */}
                  <motion.circle
                    cx={FACE_CX}
                    cy={FACE_CY - 16}
                    r={0.7}
                    fill="#10b981"
                    animate={{ opacity: [0.1, 0.3, 0.1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                    style={{ transform: 'rotate(-15deg)', transformOrigin: `${FACE_CX}px ${FACE_CY}px` }}
                  />
                </motion.g>

                {/* Orbit 2 — cyan dot, medium counter-clockwise */}
                <motion.g
                  animate={{ rotate: -360 }}
                  transition={{ rotate: { duration: 4.5, repeat: Infinity, ease: 'linear' } }}
                  style={{ transformOrigin: `${FACE_CX}px ${FACE_CY}px` }}
                >
                  <motion.circle
                    cx={FACE_CX}
                    cy={FACE_CY - 14}
                    r={1}
                    fill="#06b6d4"
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </motion.g>

                {/* Orbit 3 — amber dot, slow clockwise, wider radius */}
                <motion.g
                  animate={{ rotate: 360 }}
                  transition={{ rotate: { duration: 6, repeat: Infinity, ease: 'linear' } }}
                  style={{ transformOrigin: `${FACE_CX}px ${FACE_CY}px` }}
                >
                  <motion.circle
                    cx={FACE_CX}
                    cy={FACE_CY - 19}
                    r={0.8}
                    fill="#f59e0b"
                    animate={{ opacity: [0.25, 0.6, 0.25] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </motion.g>

                {/* Floating sparkles — tiny dots drifting upward */}
                {[0, 1, 2, 3].map(i => (
                  <motion.circle
                    key={`sparkle-${i}`}
                    cx={16 + i * 5.5}
                    cy={FACE_CY + 4}
                    r={0.5}
                    fill={['#10b981', '#06b6d4', '#f59e0b', '#10b981'][i]}
                    animate={{
                      translateY: [0, -18],
                      opacity: [0, 0.7, 0],
                    }}
                    transition={{
                      duration: 2.8,
                      repeat: Infinity,
                      delay: i * 0.7,
                      ease: 'easeOut',
                    }}
                  />
                ))}

                {/* Neural connection lines — faint lines between orbiting dots */}
                <motion.line
                  x1={FACE_CX - 8}
                  y1={FACE_CY - 8}
                  x2={FACE_CX + 8}
                  y2={FACE_CY - 12}
                  stroke="#10b981"
                  strokeWidth={0.3}
                  animate={{ opacity: [0, 0.25, 0], x1: [-8, -4, -8], x2: [8, 12, 8] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.line
                  x1={FACE_CX + 6}
                  y1={FACE_CY - 6}
                  x2={FACE_CX - 4}
                  y2={FACE_CY - 14}
                  stroke="#06b6d4"
                  strokeWidth={0.25}
                  animate={{ opacity: [0, 0.2, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                />
              </motion.g>
            )}
          </AnimatePresence>
        </motion.g>
      </motion.g>
    </svg>
  )
}
