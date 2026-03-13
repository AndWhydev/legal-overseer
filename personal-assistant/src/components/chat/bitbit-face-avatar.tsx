'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { motion } from 'motion/react'
import type { AvatarEmotion } from './use-avatar-emotion'

interface BitBitFaceAvatarProps {
  size?: number
  emotion?: AvatarEmotion
  className?: string
}

// Emotion config for each facial feature
const EMOTION_CONFIG: Record<
  AvatarEmotion,
  {
    leftEye: { cx: number; cy: number; scaleX: number; scaleY: number }
    rightEye: { cx: number; cy: number; scaleX: number; scaleY: number }
    leftBrow: { dy: number; rotate: number }
    rightBrow: { dy: number; rotate: number }
  }
> = {
  neutral: {
    leftEye: { cx: 0, cy: 0, scaleX: 1, scaleY: 1 },
    rightEye: { cx: 0, cy: 0, scaleX: 1, scaleY: 1 },
    leftBrow: { dy: 0, rotate: 0 },
    rightBrow: { dy: 0, rotate: 0 },
  },
  thinking: {
    leftEye: { cx: -1, cy: -1, scaleX: 1, scaleY: 1 },
    rightEye: { cx: -1, cy: -1, scaleX: 1, scaleY: 1 },
    leftBrow: { dy: -2, rotate: 0 },
    rightBrow: { dy: -2, rotate: 0 },
  },
  curious: {
    leftEye: { cx: 0, cy: 0, scaleX: 1.1, scaleY: 1.1 },
    rightEye: { cx: 0, cy: 0, scaleX: 1.1, scaleY: 1.1 },
    leftBrow: { dy: -3, rotate: -5 },
    rightBrow: { dy: -1, rotate: 3 },
  },
  happy: {
    leftEye: { cx: 0, cy: 0, scaleX: 1, scaleY: 0.7 },
    rightEye: { cx: 0, cy: 0, scaleX: 1, scaleY: 0.7 },
    leftBrow: { dy: 1, rotate: 0 },
    rightBrow: { dy: 1, rotate: 0 },
  },
  concerned: {
    leftEye: { cx: 0, cy: 0, scaleX: 0.95, scaleY: 0.95 },
    rightEye: { cx: 0, cy: 0, scaleX: 0.95, scaleY: 0.95 },
    leftBrow: { dy: -1, rotate: 8 },
    rightBrow: { dy: -1, rotate: -8 },
  },
  focused: {
    leftEye: { cx: 0, cy: 0, scaleX: 1, scaleY: 0.8 },
    rightEye: { cx: 0, cy: 0, scaleX: 1, scaleY: 0.8 },
    leftBrow: { dy: 1.5, rotate: 0 },
    rightBrow: { dy: 1.5, rotate: 0 },
  },
  surprised: {
    leftEye: { cx: 0, cy: 0, scaleX: 1.3, scaleY: 1.3 },
    rightEye: { cx: 0, cy: 0, scaleX: 1.3, scaleY: 1.3 },
    leftBrow: { dy: -4, rotate: 0 },
    rightBrow: { dy: -4, rotate: 0 },
  },
  processing: {
    leftEye: { cx: 0, cy: 0, scaleX: 1, scaleY: 1 },
    rightEye: { cx: 0, cy: 0, scaleX: 1, scaleY: 1 },
    leftBrow: { dy: 0, rotate: 0 },
    rightBrow: { dy: 0, rotate: 0 },
  },
}

const TRANSITION = { duration: 0.4, ease: 'easeInOut' as const }

export function BitBitFaceAvatar({
  size = 48,
  emotion = 'neutral',
  className = '',
}: BitBitFaceAvatarProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 })
  const [headTilt, setHeadTilt] = useState(0)
  const rafRef = useRef<number | null>(null)
  const lastUpdateRef = useRef(0)

  // Cursor tracking for eyes + subtle head tilt
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const now = Date.now()
    if (now - lastUpdateRef.current < 50) return // Throttle to ~20fps
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

      // Normalize and clamp eye displacement (max 2px in viewBox space)
      const maxDisplace = 2
      const factor = Math.min(distance / 300, 1)
      const angle = Math.atan2(dy, dx)

      setEyeOffset({
        x: Math.cos(angle) * factor * maxDisplace,
        y: Math.sin(angle) * factor * maxDisplace,
      })

      // Subtle head tilt (max 3deg)
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

  const config = EMOTION_CONFIG[emotion]
  const stroke = 'var(--text-primary, #fff)'

  // Processing: scanning animation for eyes
  const isProcessing = emotion === 'processing'

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
        {/* Head outline - subtle rounded rect */}
        <rect
          x="6"
          y="6"
          width="36"
          height="36"
          rx="12"
          stroke={stroke}
          strokeWidth="1.5"
          fill="none"
          opacity={0.3}
        />

        {/* Left eyebrow */}
        <motion.path
          d="M13 14 Q16 11 20 14"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          animate={{
            translateY: config.leftBrow.dy,
            rotate: config.leftBrow.rotate,
          }}
          transition={TRANSITION}
          style={{ originX: '16.5px', originY: '12.5px' }}
        />

        {/* Right eyebrow */}
        <motion.path
          d="M28 14 Q32 11 35 14"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          animate={{
            translateY: config.rightBrow.dy,
            rotate: config.rightBrow.rotate,
          }}
          transition={TRANSITION}
          style={{ originX: '31.5px', originY: '12.5px' }}
        />

        {/* Left eye */}
        <motion.circle
          cx={16 + eyeOffset.x}
          cy={20 + eyeOffset.y}
          r="2.5"
          fill={stroke}
          animate={{
            translateX: isProcessing ? [0, 3, -3, 0] : config.leftEye.cx,
            translateY: config.leftEye.cy,
            scaleX: config.leftEye.scaleX,
            scaleY: config.leftEye.scaleY,
          }}
          transition={
            isProcessing
              ? { translateX: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }, ...TRANSITION }
              : TRANSITION
          }
          style={{ originX: '16px', originY: '20px' }}
        />

        {/* Right eye */}
        <motion.circle
          cx={32 + eyeOffset.x}
          cy={20 + eyeOffset.y}
          r="2.5"
          fill={stroke}
          animate={{
            translateX: isProcessing ? [0, 3, -3, 0] : config.rightEye.cx,
            translateY: config.rightEye.cy,
            scaleX: config.rightEye.scaleX,
            scaleY: config.rightEye.scaleY,
          }}
          transition={
            isProcessing
              ? { translateX: { duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }, ...TRANSITION }
              : TRANSITION
          }
          style={{ originX: '32px', originY: '20px' }}
        />

        {/* L-shaped nose */}
        <path
          d="M24 22 L24 28 L27 28"
          stroke={stroke}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={0.5}
        />

        {/* Thinking: slow blink overlay */}
        {emotion === 'thinking' && (
          <motion.g
            animate={{ opacity: [0, 0, 1, 0, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <rect x="13" y="18" width="7" height="5" rx="1" fill="var(--bg-primary, #0c0e14)" />
            <rect x="29" y="18" width="7" height="5" rx="1" fill="var(--bg-primary, #0c0e14)" />
          </motion.g>
        )}
      </motion.g>
    </svg>
  )
}
