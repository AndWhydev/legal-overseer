'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

/**
 * BitBit Wisp Intro — ASCII characters stream in from edges of the page
 * like Sandman's sand, converging to form the BitBit face.
 * Once settled, calls onComplete to reveal the real face.
 */

interface BitBitWispIntroProps {
  /** Target ASCII string to assemble (pre-rendered face) */
  targetText: string
  /** Font size matching the face display */
  fontSize: number
  /** Called when the animation finishes */
  onComplete: () => void
  /** Container width */
  width: number
  /** Container height */
  height: number
  /** Text color — should match the live face's computed color */
  color?: string
  /** Target rect override — position where the face sits on screen */
  targetRect?: { left: number; top: number }
  className?: string
}

interface WispParticle {
  // Target position (where it settles in the face)
  tx: number
  ty: number
  // Current position
  x: number
  y: number
  // Velocity
  vx: number
  vy: number
  // The character
  ch: string
  // Which stream (0-7) — determines curve path
  stream: number
  // Progress along the stream (0=start, 1=arrived)
  progress: number
  // Speed multiplier
  speed: number
  // Delay before starting
  delay: number
  // Whether it's settled at target
  settled: boolean
  // Opacity
  alpha: number
  // Trail positions
  trail: { x: number; y: number; alpha: number }[]
}

// Stream origins — 8 points around the edges
const STREAM_ORIGINS = [
  { x: -0.2, y: -0.2 },   // top-left
  { x: 0.5, y: -0.3 },    // top-center
  { x: 1.2, y: -0.2 },    // top-right
  { x: 1.3, y: 0.5 },     // right-center
  { x: 1.2, y: 1.2 },     // bottom-right
  { x: 0.5, y: 1.3 },     // bottom-center
  { x: -0.2, y: 1.2 },    // bottom-left
  { x: -0.3, y: 0.5 },    // left-center
]

// Bezier control point offsets for curvy stream paths
const STREAM_CURVES = [
  { cx1: 0.3, cy1: 0.1, cx2: 0.2, cy2: 0.4 },
  { cx1: 0.4, cy1: 0.2, cx2: 0.5, cy2: 0.3 },
  { cx1: 0.7, cy1: 0.1, cx2: 0.6, cy2: 0.4 },
  { cx1: 0.8, cy1: 0.3, cx2: 0.7, cy2: 0.5 },
  { cx1: 0.7, cy1: 0.8, cx2: 0.6, cy2: 0.6 },
  { cx1: 0.5, cy1: 0.9, cx2: 0.5, cy2: 0.7 },
  { cx1: 0.2, cy1: 0.8, cx2: 0.3, cy2: 0.6 },
  { cx1: 0.1, cy1: 0.5, cx2: 0.3, cy2: 0.5 },
]

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const t2 = t * t
  const t3 = t2 * t
  const mt = 1 - t
  const mt2 = mt * mt
  const mt3 = mt2 * mt
  return mt3 * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3 * p3
}

// Ease-in-out for progress
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function BitBitWispIntro({
  targetText,
  fontSize,
  onComplete,
  width,
  height,
  color = '#e5e5e5',
  targetRect,
  className,
}: BitBitWispIntroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef(0)
  const particlesRef = useRef<WispParticle[]>([])
  const startTimeRef = useRef(0)
  const completedRef = useRef(false)

  // Portal mount state — must be declared before the main effect
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Full viewport dimensions
    const vw = window.innerWidth
    const vh = window.innerHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = vw * dpr
    canvas.height = vh * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // Parse target text into character positions
    const lines = targetText.split('\n')
    const charW = fontSize * 0.6
    const charH = fontSize
    const maxCols = Math.max(...lines.map(l => l.length))
    const gridW = maxCols * charW
    const gridH = lines.length * charH

    // Get the face container's position — prefer parent-provided rect, fallback to own container
    const getFacePos = () => {
      // Always re-read from the actual DOM for accuracy
      const parentSource = document.querySelector('[data-bitbit-face-source]')
      if (parentSource) return parentSource.getBoundingClientRect()
      if (targetRect) return targetRect
      return container.getBoundingClientRect()
    }

    // Create particles for each non-space character
    const particles: WispParticle[] = []
    for (let row = 0; row < lines.length; row++) {
      for (let col = 0; col < lines[row].length; col++) {
        const ch = lines[row][col]
        if (ch === ' ') continue

        // Store grid-relative position — viewport position computed per frame
        const tx = col * charW + charW / 2 + (width - gridW) / 2
        const ty = row * charH + charH / 2 + (height - gridH) / 2

        // Assign to a random stream — origins are viewport edges
        const stream = Math.floor(Math.random() * STREAM_ORIGINS.length)
        const origin = STREAM_ORIGINS[stream]

        // Start position from viewport edges (not container edges)
        const startX = origin.x * vw + (Math.random() - 0.5) * vw * 0.2
        const startY = origin.y * vh + (Math.random() - 0.5) * vh * 0.2

        particles.push({
          tx, ty,
          x: startX,
          y: startY,
          vx: 0, vy: 0,
          ch,
          stream,
          progress: 0,
          speed: 0.5 + Math.random() * 0.6, // varied speeds (faster minimum)
          delay: Math.random() * 0.8, // tighter stagger so all arrive close together
          settled: false,
          alpha: 0,
          trail: [],
        })
      }
    }

    // Sort by delay so early ones start first
    particles.sort((a, b) => a.delay - b.delay)
    particlesRef.current = particles
    startTimeRef.current = performance.now()

    const DURATION = 3.0 // total animation seconds
    const SETTLE_THRESHOLD = 4 // pixels from target to snap (generous)
    const animate = () => {
      const now = performance.now()
      const elapsed = (now - startTimeRef.current) / 1000

      // Re-read container position each frame (handles layout shifts from sidebar etc.)
      const pos = getFacePos()
      const faceX = pos.left
      const faceY = pos.top

      ctx.clearRect(0, 0, vw, vh)

      ctx.font = `${fontSize}px 'Courier New', Courier, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0

      let allSettled = true

      for (const p of particles) {
        // Viewport-space target = grid-relative + face container position
        const vtx = p.tx + faceX
        const vty = p.ty + faceY

        if (p.settled) {
          ctx.globalAlpha = 1
          ctx.fillStyle = color
          ctx.fillText(p.ch, vtx, vty)
          continue
        }

        const particleTime = elapsed - p.delay
        if (particleTime < 0) {
          allSettled = false
          continue
        }

        allSettled = false

        const rawProgress = Math.min(1, (particleTime * p.speed) / (DURATION - p.delay))
        p.progress = easeInOutCubic(rawProgress)

        const origin = STREAM_ORIGINS[p.stream]
        const curve = STREAM_CURVES[p.stream]
        const sx = origin.x * vw
        const sy = origin.y * vh

        p.x = cubicBezier(
          p.progress,
          sx,
          curve.cx1 * vw,
          curve.cx2 * vw + (vtx - vw / 2) * 0.3,
          vtx
        )
        p.y = cubicBezier(
          p.progress,
          sy,
          curve.cy1 * vh,
          curve.cy2 * vh + (vty - vh / 2) * 0.3,
          vty
        )

        if (p.progress < 0.9) {
          p.x += Math.sin(particleTime * 8 + p.delay * 20) * (1 - p.progress) * 3
          p.y += Math.cos(particleTime * 6 + p.delay * 15) * (1 - p.progress) * 2
        }

        const dx = p.x - vtx
        const dy = p.y - vty
        if (dx * dx + dy * dy < SETTLE_THRESHOLD * SETTLE_THRESHOLD || p.progress > 0.98) {
          p.settled = true
          p.x = vtx
          p.y = vty
          p.alpha = 1
          continue
        }

        // Fade in as it moves
        p.alpha = Math.min(1, p.progress * 2)

        // Update trail
        p.trail.push({ x: p.x, y: p.y, alpha: p.alpha * 0.3 })
        if (p.trail.length > 6) p.trail.shift()

        // Draw trail
        for (const t of p.trail) {
          ctx.globalAlpha = t.alpha * 0.15
          ctx.fillStyle = color
          ctx.fillText(p.ch, t.x, t.y)
          t.alpha *= 0.7
        }

        // Draw particle
        ctx.globalAlpha = p.alpha
        ctx.fillStyle = color
        ctx.fillText(p.ch, p.x, p.y)
      }

      ctx.globalAlpha = 1

      if (allSettled && !completedRef.current) {
        completedRef.current = true
        // Quick succession — swap to live face fast
        setTimeout(onComplete, 200)
        // Keep drawing settled chars during the hold
      }

      // Force complete after max duration
      if (elapsed > DURATION + 3 && !completedRef.current) {
        completedRef.current = true
        onComplete()
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [targetText, fontSize, width, height, color, onComplete, mounted])

  // Portal the canvas to document.body so position:fixed works correctly
  // (motion.div ancestors with transforms break fixed positioning)

  return (
    <div ref={containerRef} className={className} style={{ width, height }}>
      {mounted && createPortal(
        <canvas
          ref={canvasRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        />,
        document.body
      )}
    </div>
  )
}
