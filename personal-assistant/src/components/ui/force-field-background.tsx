'use client'

import { useEffect, useRef, useCallback } from 'react'

interface Particle {
  x: number
  y: number
  ox: number
  oy: number
  vx: number
  vy: number
  size: number
  brightness: number
}

interface ForceFieldBackgroundProps {
  /** Grid spacing — lower = more particles. Min 6 recommended on mobile. */
  spacing?: number
  /** Minimum dot radius */
  minStroke?: number
  /** Maximum dot radius */
  maxStroke?: number
  /** Cursor repulsion strength */
  forceStrength?: number
  /** Radius of the interaction area */
  magnifierRadius?: number
  /** Movement friction (0–1, higher = more damping) */
  friction?: number
  /** Spring-back speed toward origin */
  restoreSpeed?: number
  /** Canvas background color */
  bgColor?: string
  /** Particle color (rgb only, alpha is computed per-particle) */
  particleRgb?: string
  className?: string
}

export function ForceFieldBackground({
  spacing = 14,
  minStroke = 1,
  maxStroke = 3,
  forceStrength = 12,
  magnifierRadius = 150,
  friction = 0.88,
  restoreSpeed = 0.04,
  bgColor = '#000',
  particleRgb = '255,255,255',
  className = '',
}: ForceFieldBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const mouseRef = useRef({ x: -9999, y: -9999, sx: -9999, sy: -9999 })
  const rafRef = useRef<number>(0)
  const reducedMotionRef = useRef(false)
  const dprRef = useRef(1)

  const generateParticles = useCallback(
    (w: number, h: number) => {
      const pts: Particle[] = []
      const gap = Math.max(5, spacing)

      for (let y = 0; y < h; y += gap) {
        for (let x = 0; x < w; x += gap) {
          if (Math.random() > 0.55) continue
          const jx = x + (Math.random() - 0.5) * gap * 0.35
          const jy = y + (Math.random() - 0.5) * gap * 0.35
          const b = 0.08 + Math.random() * 0.42
          const sz = minStroke + b * (maxStroke - minStroke)
          pts.push({ x: jx, y: jy, ox: jx, oy: jy, vx: 0, vy: 0, size: sz, brightness: b })
        }
      }
      return pts
    },
    [spacing, minStroke, maxStroke],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = mql.matches
    const onMotionChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches
    }
    mql.addEventListener('change', onMotionChange)

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    let w = 0
    let h = 0

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      dprRef.current = dpr
      w = rect.width
      h = rect.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      particlesRef.current = generateParticles(w, h)
      cachedRect = canvas.getBoundingClientRect()
      rectAge = Date.now()
    }

    // Cache bounding rect to avoid layout thrashing on mousemove
    let cachedRect = canvas.getBoundingClientRect()
    let rectAge = Date.now()

    resize()
    const getRect = () => {
      const now = Date.now()
      if (now - rectAge > 500) { cachedRect = canvas.getBoundingClientRect(); rectAge = now }
      return cachedRect
    }
    const onMouse = (e: MouseEvent) => {
      const r = getRect()
      mouseRef.current.x = e.clientX - r.left
      mouseRef.current.y = e.clientY - r.top
    }
    const onTouch = (e: TouchEvent) => {
      const r = getRect()
      const t = e.touches[0]
      if (t) {
        mouseRef.current.x = t.clientX - r.left
        mouseRef.current.y = t.clientY - r.top
      }
    }
    const onLeave = () => {
      mouseRef.current.x = -9999
      mouseRef.current.y = -9999
    }

    window.addEventListener('mousemove', onMouse, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })
    document.addEventListener('mouseleave', onLeave)
    window.addEventListener('resize', resize)

    const draw = () => {
      const pts = particlesRef.current
      const m = mouseRef.current

      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, w, h)

      // Smooth cursor tracking
      m.sx += (m.x - m.sx) * 0.1
      m.sy += (m.y - m.sy) * 0.1

      const noMotion = reducedMotionRef.current
      const mr = magnifierRadius
      const mr2 = mr * mr

      if (!noMotion) {
        for (let i = 0, len = pts.length; i < len; i++) {
          const p = pts[i]
          const dx = p.x - m.sx
          const dy = p.y - m.sy
          const d2 = dx * dx + dy * dy

          if (d2 < mr2 && d2 > 1) {
            const d = Math.sqrt(d2)
            const f = forceStrength / d
            p.vx += (dx / d) * f
            p.vy += (dy / d) * f
          }

          p.vx *= friction
          p.vy *= friction
          p.vx += (p.ox - p.x) * restoreSpeed
          p.vy += (p.oy - p.y) * restoreSpeed
          p.x += p.vx
          p.y += p.vy
        }
      }

      // Batch draw — round to avoid sub-pixel antialiasing cost
      for (let i = 0, len = pts.length; i < len; i++) {
        const p = pts[i]
        let sz = p.size

        if (!noMotion) {
          const dx = p.x - m.sx
          const dy = p.y - m.sy
          const d2 = dx * dx + dy * dy
          if (d2 < mr2) {
            sz *= 1 + (1 - Math.sqrt(d2) / mr) * 0.7
          }
        }

        const alpha = p.brightness
        // Use integer alpha step for batching (8 levels)
        const a = Math.round(alpha * 8) / 8
        ctx.fillStyle = `rgba(${particleRgb},${a})`
        ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz)
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('touchmove', onTouch)
      document.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('resize', resize)
      mql.removeEventListener('change', onMotionChange)
    }
  }, [generateParticles, forceStrength, magnifierRadius, friction, restoreSpeed, bgColor, particleRgb])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      aria-hidden="true"
    />
  )
}
