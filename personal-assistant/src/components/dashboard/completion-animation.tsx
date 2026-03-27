'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface CompletionAnimationProps {
  trigger: boolean
  onComplete?: () => void
  variant?: 'checkmark' | 'confetti' | 'ripple'
  x?: number
  y?: number
}

const CONFETTI_PARTICLES = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * 2 * Math.PI
  const distance = 20 + Math.random() * 16
  return {
    tx: `${Math.cos(angle) * distance}px`,
    ty: `${Math.sin(angle) * distance - 10}px`,
    rot: `${Math.random() * 360}deg`,
    color: ['#D4A574', '#FBBF24', '#7CAA85', '#E8C49A', '#A78BFA'][i % 5],
    delay: `${i * 30}ms`,
  }
})

const CHECK_PARTICLES = [
  { tx: '-18px', ty: '-22px' },
  { tx: '20px', ty: '-16px' },
  { tx: '-14px', ty: '20px' },
  { tx: '22px', ty: '14px' },
  { tx: '0px', ty: '-26px' },
]

function CheckmarkAnimation() {
  return (
    <>
      <svg width="28" height="28" viewBox="0 0 28 28" className="animate-task-complete">
        <circle cx="14" cy="14" r="12" fill="#D4A574" opacity="0.15" />
        <path
          d="M9 14.5l3.5 3.5 7-7"
          fill="none"
          stroke="#D4A574"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-check-draw"
        />
      </svg>
      {CHECK_PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-foreground animate-particle"
          style={{
            '--tx': p.tx,
            '--ty': p.ty,
          } as React.CSSProperties}
        />
      ))}
    </>
  )
}

function ConfettiAnimation() {
  return (
    <>
      {CONFETTI_PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 rounded-sm animate-confetti"
          style={{
            width: i % 2 === 0 ? '4px' : '3px',
            height: i % 2 === 0 ? '4px' : '6px',
            backgroundColor: p.color,
            '--tx': p.tx,
            '--ty': p.ty,
            '--rot': p.rot,
            animationDelay: p.delay,
          } as React.CSSProperties}
        />
      ))}
    </>
  )
}

function RippleAnimation() {
  return (
    <>
      <div
        className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full border-2 border-[#D4A574] animate-ripple"
      />
      <div
        className="absolute left-1/2 top-1/2 h-8 w-8 rounded-full border border-[#D4A574]/50 animate-ripple"
        style={{ animationDelay: '100ms' }}
      />
    </>
  )
}

export function CompletionAnimation({
  trigger,
  onComplete,
  variant = 'checkmark',
  x = 0,
  y = 0,
}: CompletionAnimationProps) {
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!trigger) {
      setVisible(false)
      return
    }
    setVisible(true)
    const duration = variant === 'confetti' ? 800 : 650
    const timer = setTimeout(() => {
      setVisible(false)
      onComplete?.()
    }, duration)
    return () => clearTimeout(timer)
  }, [trigger, onComplete, variant])

  if (!visible || !mounted) return null

  return createPortal(
    <div
      className="pointer-events-none fixed z-50"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
    >
      {variant === 'checkmark' && <CheckmarkAnimation />}
      {variant === 'confetti' && <ConfettiAnimation />}
      {variant === 'ripple' && <RippleAnimation />}
    </div>,
    document.body,
  )
}
