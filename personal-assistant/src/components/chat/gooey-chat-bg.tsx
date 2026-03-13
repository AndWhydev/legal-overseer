'use client'

import { useEffect, useRef } from 'react'

/**
 * Animated gooey gradient background for the chat page.
 * Black base with slow-moving, merging gradient blobs + grain overlay.
 *
 * Performance:
 * - All blob movement via CSS @keyframes (GPU-composited transforms)
 * - Mouse-follow uses rAF with integer rounding (no layout thrash)
 * - Grain is a tiled static SVG feTurbulence (rendered once, repeated)
 * - Respects prefers-reduced-motion
 */
export function GooeyChatBg() {
  const interactiveRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Skip mouse tracking if user prefers reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let curX = 0
    let curY = 0
    let tgX = 0
    let tgY = 0
    let raf: number

    const onMove = (e: MouseEvent) => {
      tgX = e.clientX
      tgY = e.clientY
    }

    const tick = () => {
      curX += (tgX - curX) / 20
      curY += (tgY - curY) / 20
      if (interactiveRef.current) {
        interactiveRef.current.style.transform = `translate(${Math.round(curX)}px, ${Math.round(curY)}px)`
      }
      raf = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="bb-gooey-bg" aria-hidden="true">
      {/* SVG goo filter — hidden, referenced by CSS */}
      <svg xmlns="http://www.w3.org/2000/svg" style={{ position: 'fixed', width: 0, height: 0 }}>
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      {/* Gradient blobs */}
      <div className="bb-gooey-bg__blobs">
        <div className="bb-gooey-bg__g1" />
        <div className="bb-gooey-bg__g2" />
        <div className="bb-gooey-bg__g3" />
        <div className="bb-gooey-bg__g4" />
        <div className="bb-gooey-bg__g5" />
        <div ref={interactiveRef} className="bb-gooey-bg__interactive" />
      </div>

      {/* Grain noise overlay */}
      <div className="bb-gooey-bg__noise" />
    </div>
  )
}
