'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { motion } from 'motion/react'
import type { AvatarEmotion } from './use-avatar-emotion'

interface BitBitFaceAvatarProps {
  size?: number
  emotion?: AvatarEmotion
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

export function BitBitFaceAvatar({
  size = 48,
  emotion = 'neutral',
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
      <motion.g
        animate={{ rotate: headTilt }}
        transition={{ duration: 0.15, ease: 'linear' }}
        style={{ originX: '24px', originY: '24px' }}
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
          style={{ originX: '24px', originY: '22px' }}
        >
          {/* Left eyebrow */}
          <motion.path
            d="M13 14 Q16.5 10 20 14"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            animate={{
              translateY: config.leftBrow.dy,
              rotate: config.leftBrow.rotate,
            }}
            transition={TRANSITION}
            style={{ originX: '16.5px', originY: '12px' }}
          />

          {/* Right eyebrow */}
          <motion.path
            d="M28 14 Q31.5 10 35 14"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            animate={{
              translateY: config.rightBrow.dy,
              rotate: config.rightBrow.rotate,
            }}
            transition={TRANSITION}
            style={{ originX: '31.5px', originY: '12px' }}
          />

          {/* Left eye — cursor offset baked into cx/cy, scale animates around fixed origin */}
          <motion.circle
            cx={16}
            cy={20}
            r="2.5"
            fill={color}
            animate={{
              translateX: isProcessing ? [0, 2, -2, 0] : config.leftEye.cx + eyeOffset.x,
              translateY: eyeOffset.y,
              scaleX: config.leftEye.scaleX,
              scaleY: blinkScaleY ?? config.leftEye.scaleY,
            }}
            transition={
              isBlinking
                ? BLINK_TRANSITION
                : isProcessing
                  ? { translateX: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }, ...TRANSITION }
                  : TRANSITION
            }
            style={{ originX: '16px', originY: '20px' }}
          />

          {/* Right eye */}
          <motion.circle
            cx={32}
            cy={20}
            r="2.5"
            fill={color}
            animate={{
              translateX: isProcessing ? [0, 2, -2, 0] : config.rightEye.cx + eyeOffset.x,
              translateY: eyeOffset.y,
              scaleX: config.rightEye.scaleX,
              scaleY: blinkScaleY ?? config.rightEye.scaleY,
            }}
            transition={
              isBlinking
                ? BLINK_TRANSITION
                : isProcessing
                  ? { translateX: { duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }, ...TRANSITION }
                  : TRANSITION
            }
            style={{ originX: '32px', originY: '20px' }}
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
              translateY: config.nose.dy,
              rotate: config.nose.rotate,
            }}
            transition={TRANSITION}
            style={{ originX: '25.5px', originY: '25px' }}
          />
        </motion.g>
      </motion.g>
    </svg>
  )
}
