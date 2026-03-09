'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'

type AuroraCharacterProps = {
  size?: number
  className?: string
  interactive?: boolean
}

type PointerState = {
  x: number
  y: number
}

const REST_POINTER: PointerState = { x: 0, y: 0 }

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function AuroraCharacter({
  size = 220,
  className,
  interactive = true,
}: AuroraCharacterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useReducedMotion()
  const [pointer, setPointer] = useState<PointerState>(REST_POINTER)
  const [isBlinking, setIsBlinking] = useState(false)
  const gradientId = useId().replace(/:/g, '')
  const blinkState = reduceMotion ? false : isBlinking

  useEffect(() => {
    if (reduceMotion) return undefined

    let blinkTimer = 0
    let resetTimer = 0

    const scheduleBlink = () => {
      blinkTimer = window.setTimeout(() => {
        setIsBlinking(true)
        resetTimer = window.setTimeout(() => {
          setIsBlinking(false)
          scheduleBlink()
        }, 170)
      }, 2200 + Math.random() * 2600)
    }

    scheduleBlink()

    return () => {
      window.clearTimeout(blinkTimer)
      window.clearTimeout(resetTimer)
    }
  }, [reduceMotion])

  useEffect(() => {
    if (!interactive) return undefined

    const handleWindowPointerMove = (event: globalThis.PointerEvent) => {
      const bounds = containerRef.current?.getBoundingClientRect()
      if (!bounds) return

      const centerX = bounds.left + bounds.width / 2
      const centerY = bounds.top + bounds.height / 2

      const nextX = (event.clientX - centerX) / (window.innerWidth / 2)
      const nextY = (event.clientY - centerY) / (window.innerHeight / 2)

      setPointer({
        x: clamp(nextX, -1, 1),
        y: clamp(nextY, -1, 1),
      })
    }

    window.addEventListener('pointermove', handleWindowPointerMove)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
    }
  }, [interactive])

  const faceX = pointer.x * 7
  const faceY = pointer.y * 6
  const pupilX = pointer.x * 4.2
  const pupilY = pointer.y * 2.8
  const browLift = -pointer.y * 2.5
  const browTilt = pointer.x * 6
  const shellClasses = [
    'relative isolate inline-flex shrink-0 items-center justify-center overflow-visible',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Animated BitBit mascot"
      data-testid="aurora-character"
      className={shellClasses}
      style={{ width: size, height: size }}
    >
      <span className="sr-only">Animated BitBit mascot</span>

      <motion.div
        className="absolute inset-[-14%] rounded-full bg-[radial-gradient(circle,_rgba(255,189,146,0.42)_0%,_rgba(214,234,255,0.24)_42%,_rgba(255,255,255,0)_74%)] blur-3xl"
        animate={
          reduceMotion
            ? undefined
            : {
                scale: [1, 1.06, 0.94, 1],
                opacity: [0.58, 0.78, 0.54, 0.58],
              }
        }
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle_at_40%_34%,rgba(255,255,255,0.3),rgba(255,255,255,0.0)_52%)] blur-2xl"
        animate={
          reduceMotion
            ? undefined
            : {
                opacity: [0.28, 0.5, 0.34, 0.28],
                scale: [1, 1.04, 0.98, 1],
              }
        }
        transition={{ duration: 9.4, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="absolute inset-[8%]"
        animate={
          reduceMotion
            ? { y: 0, rotate: 0, scale: 1 }
            : {
                y: [0, -7, 0],
                rotate: [-1.2, 1.4, -1.2],
                scale: [1, 1.015, 0.992, 1],
              }
        }
        transition={{ duration: 7.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={
            reduceMotion
              ? { filter: 'hue-rotate(0deg)' }
              : {
                  filter: [
                    'hue-rotate(0deg)',
                    'hue-rotate(12deg)',
                    'hue-rotate(-8deg)',
                    'hue-rotate(0deg)',
                  ],
                }
          }
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            boxShadow:
              '0 32px 70px rgba(219, 154, 113, 0.22), 0 14px 34px rgba(128, 167, 214, 0.16)',
          }}
        >
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_28%,rgba(255,255,255,0.96)_0%,rgba(255,240,222,0.95)_18%,rgba(255,206,167,0.9)_38%,rgba(235,184,160,0.88)_58%,rgba(203,222,255,0.82)_82%,rgba(188,225,255,0.72)_100%)]" />
          <div className="absolute inset-[7%] rounded-full border border-white/45 bg-[radial-gradient(circle_at_68%_72%,rgba(255,255,255,0.06),rgba(255,255,255,0.0)_52%),radial-gradient(circle_at_28%_24%,rgba(255,255,255,0.42),rgba(255,255,255,0.0)_34%)]" />
          <motion.div
            className="absolute inset-[11%] rounded-full border border-white/35"
            animate={
              reduceMotion
                ? { opacity: 0.62, scale: 1 }
                : {
                    opacity: [0.5, 0.72, 0.58, 0.5],
                    scale: [1, 1.02, 0.99, 1],
                  }
            }
            transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute left-[18%] top-[13%] h-[24%] w-[30%] rounded-full bg-white/52 blur-2xl"
            animate={
              reduceMotion
                ? { opacity: 0.68, x: 0, y: 0 }
                : {
                    opacity: [0.55, 0.82, 0.64, 0.55],
                    x: [0, 8, 0],
                    y: [0, -4, 0],
                  }
            }
            transition={{ duration: 7.4, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.svg
            viewBox="0 0 200 200"
            className="absolute inset-[13%] h-[74%] w-[74%] overflow-visible"
            animate={{ x: faceX, y: faceY }}
            transition={{ type: 'spring', stiffness: 140, damping: 18, mass: 0.8 }}
          >
            <defs>
              <radialGradient id={`${gradientId}-pupil`} cx="40%" cy="35%" r="70%">
                <stop offset="0%" stopColor="#2e2420" />
                <stop offset="100%" stopColor="#1a1310" />
              </radialGradient>
            </defs>

            <motion.g
              animate={{ x: -1.2 + browTilt * -0.16, y: 49 + browLift, rotate: browTilt * -0.18 }}
              transition={{ type: 'spring', stiffness: 180, damping: 16 }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            >
              <path
                d="M41 0 C53 -7 69 -7 81 1"
                fill="none"
                stroke="#7c4e3b"
                strokeWidth="7"
                strokeLinecap="round"
                opacity="0.86"
              />
            </motion.g>

            <motion.g
              animate={{ x: 118 + browTilt * -0.16, y: 49 + browLift, rotate: browTilt * -0.18 }}
              transition={{ type: 'spring', stiffness: 180, damping: 16 }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            >
              <path
                d="M0 1 C12 -7 28 -7 40 0"
                fill="none"
                stroke="#7c4e3b"
                strokeWidth="7"
                strokeLinecap="round"
                opacity="0.86"
              />
            </motion.g>

            <motion.ellipse
              cx="72"
              cy="96"
              rx="22"
              animate={{ ry: blinkState ? 2.2 : 16 }}
              transition={{ duration: 0.16, ease: 'easeInOut' }}
              fill="rgba(255,255,255,0.92)"
            />
            <motion.ellipse
              cx="128"
              cy="96"
              rx="22"
              animate={{ ry: blinkState ? 2.2 : 16 }}
              transition={{ duration: 0.16, ease: 'easeInOut' }}
              fill="rgba(255,255,255,0.92)"
            />

            <motion.circle
              r="6.5"
              animate={{
                cx: 72 + pupilX,
                cy: 96 + pupilY,
                opacity: blinkState ? 0.18 : 1,
              }}
              transition={{ type: 'spring', stiffness: 180, damping: 18 }}
              fill={`url(#${gradientId}-pupil)`}
            />
            <motion.circle
              r="6.5"
              animate={{
                cx: 128 + pupilX,
                cy: 96 + pupilY,
                opacity: blinkState ? 0.18 : 1,
              }}
              transition={{ type: 'spring', stiffness: 180, damping: 18 }}
              fill={`url(#${gradientId}-pupil)`}
            />

            <motion.circle
              r="1.9"
              animate={{
                cx: 74 + pupilX,
                cy: 94 + pupilY,
                opacity: blinkState ? 0.08 : 0.88,
              }}
              transition={{ type: 'spring', stiffness: 180, damping: 18 }}
              fill="rgba(255,255,255,0.88)"
            />
            <motion.circle
              r="1.9"
              animate={{
                cx: 130 + pupilX,
                cy: 94 + pupilY,
                opacity: blinkState ? 0.08 : 0.88,
              }}
              transition={{ type: 'spring', stiffness: 180, damping: 18 }}
              fill="rgba(255,255,255,0.88)"
            />

            <motion.path
              d="M83 132 C93 141 107 141 117 132"
              fill="none"
              stroke="#5f3d33"
              strokeWidth="6"
              strokeLinecap="round"
              animate={{ d: pointer.y > 0.35 ? 'M83 133 C93 137 107 137 117 133' : 'M83 132 C93 141 107 141 117 132' }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
            />

            <ellipse cx="55" cy="119" rx="11" ry="7" fill="rgba(255,255,255,0.12)" />
            <ellipse cx="145" cy="119" rx="11" ry="7" fill="rgba(255,255,255,0.12)" />
          </motion.svg>
        </motion.div>
      </motion.div>

      <motion.div
        className="pointer-events-none absolute inset-x-[18%] bottom-[6%] h-[16%] rounded-full bg-[radial-gradient(circle,_rgba(105,131,173,0.18)_0%,_rgba(255,255,255,0)_72%)] blur-2xl"
        animate={reduceMotion ? undefined : { scaleX: [1, 1.08, 0.96, 1], opacity: [0.32, 0.48, 0.36, 0.32] }}
        transition={{ duration: 6.8, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}
