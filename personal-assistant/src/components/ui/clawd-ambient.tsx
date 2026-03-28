'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

/**
 * Clawd Ambient — the BitBit eyes animation.
 * Runs the full wake sequence (flicker on, head lift, double blink)
 * then transitions to idle animation playlist (emotions, breathing, blinking).
 * Pure canvas — no DOM manipulation, no videos, no external deps.
 */
export function ClawdAmbient({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  // Detect light/dark mode
  const [isDark, setIsDark] = useState(true)
  useEffect(() => {
    const check = () => {
      const dark = document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches
      setIsDark(dark)
    }
    check()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', check)
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { mq.removeEventListener('change', check); obs.disconnect() }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Resize to container
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    const W = rect.width
    const H = rect.height

    const EYE_COLOR = isDark ? '#e5e5e5' : '#1a1a1a'
    const BG_COLOR = isDark ? '#000000' : '#fafafa'

    // Fill background
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, W, H)
    const EYE_W = W * 0.065
    const EYE_H = W * 0.09
    const EYE_GAP = W * 0.12
    const CX = W / 2
    const CY = H / 2
    const SCANLINE_GAP = 3

    // Draw a single eye with scanlines + glow baked in
    function drawEye(x: number, y: number, w: number, h: number) {
      if (!ctx) return
      // Outer glow
      ctx.shadowColor = EYE_COLOR
      ctx.shadowBlur = 16
      ctx.fillStyle = EYE_COLOR
      ctx.fillRect(x, y, w, h)
      ctx.shadowBlur = 0

      // Scanlines clipped to the eye rect
      const lineColor = isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.25)'
      ctx.fillStyle = lineColor
      for (let ly = y; ly < y + h; ly += SCANLINE_GAP * 2) {
        ctx.fillRect(x, ly, w, 1)
      }
    }

    // ── State machine ──
    const state = stateRef.current
    const now = performance.now()
    const elapsed = now - state.startTime

    ctx.clearRect(0, 0, W, H)

    // Scene timings (ms)
    const SCENE_1_END = 800        // black
    const SCENE_2_END = 2200       // flicker on
    const SCENE_3_END = 3600       // head lift
    const SCENE_4_END = 4400       // eyes full size
    const SCENE_5_END = 5200       // double blink
    const WAKE_END = 5600          // transition to idle

    if (elapsed < SCENE_1_END) {
      // Scene 1: Black — nothing drawn
    } else if (elapsed < SCENE_2_END) {
      // Scene 2: Eyes flicker on, head drooped
      const t = (elapsed - SCENE_1_END) / (SCENE_2_END - SCENE_1_END)
      const headAngle = -0.25 // drooped

      // Flicker: pseudo-random opacity based on time
      const flicker = (offset: number) => {
        const x = (t * 12 + offset) % 1
        const noise = Math.sin(x * 47) * Math.sin(x * 113) * Math.sin(x * 271)
        const base = t * t // gradually brighter
        return Math.max(0, Math.min(1, base + noise * 0.4 * (1 - t)))
      }

      const opL = flicker(0)
      const opR = flicker(0.3)

      // Slim eyes when drooped (foreshortened)
      const slimW = EYE_W * 0.3
      const slimH = EYE_H * 0.8

      ctx.save()
      ctx.translate(CX, CY)
      ctx.rotate(headAngle)

      // Left eye
      ctx.globalAlpha = opL
      drawEye(-EYE_GAP / 2 - slimW, -slimH / 2, slimW, slimH)

      // Right eye
      ctx.globalAlpha = opR
      drawEye(EYE_GAP / 2, -slimH / 2, slimW, slimH)

      ctx.restore()
    } else if (elapsed < SCENE_3_END) {
      // Scene 3: Head lifts — angle goes from -0.25 to 0
      const t = (elapsed - SCENE_2_END) / (SCENE_3_END - SCENE_2_END)
      const ease = t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2
      const headAngle = -0.25 * (1 - ease)

      // Eyes grow from slim to medium
      const eyeW = EYE_W * (0.3 + 0.5 * ease)
      const eyeH = EYE_H * (0.8 + 0.15 * ease)

      ctx.save()
      ctx.translate(CX, CY)
      ctx.rotate(headAngle)
      ctx.globalAlpha = 1

      drawEye(-EYE_GAP / 2 - eyeW, -eyeH / 2, eyeW, eyeH)
      drawEye(EYE_GAP / 2, -eyeH / 2, eyeW, eyeH)

      ctx.restore()
    } else if (elapsed < SCENE_4_END) {
      // Scene 4: Eyes reach full size
      const t = (elapsed - SCENE_3_END) / (SCENE_4_END - SCENE_3_END)
      const ease = 1 - Math.pow(1 - t, 3)

      const eyeW = EYE_W * (0.8 + 0.2 * ease)
      const eyeH = EYE_H * (0.95 + 0.05 * ease)

      ctx.save()
      ctx.translate(CX, CY)
      ctx.globalAlpha = 1

      drawEye(-EYE_GAP / 2 - eyeW, -eyeH / 2, eyeW, eyeH)
      drawEye(EYE_GAP / 2, -eyeH / 2, eyeW, eyeH)
      ctx.restore()
    } else if (elapsed < SCENE_5_END) {
      // Scene 5: Double blink
      const t = (elapsed - SCENE_4_END) / (SCENE_5_END - SCENE_4_END)

      // Two blinks: 0-0.35 blink1, 0.45-0.8 blink2, 0.8+ open
      let eyeScale = 1
      if (t < 0.15) eyeScale = 1 - t / 0.15          // closing
      else if (t < 0.25) eyeScale = (t - 0.15) / 0.1  // opening
      else if (t < 0.35) eyeScale = 1                  // open
      else if (t < 0.5) eyeScale = 1 - (t - 0.35) / 0.15  // closing
      else if (t < 0.65) eyeScale = (t - 0.5) / 0.15   // opening
      else eyeScale = 1                                  // open

      eyeScale = Math.max(0.04, eyeScale)

      ctx.save()
      ctx.translate(CX, CY)
      ctx.globalAlpha = 1
      const h = EYE_H * eyeScale
      drawEye(-EYE_GAP / 2 - EYE_W, -h / 2, EYE_W, h)
      drawEye(EYE_GAP / 2, -h / 2, EYE_W, h)
      ctx.restore()
    } else {
      // Scene 6: Idle animation
      const idleT = (elapsed - WAKE_END) / 1000 // seconds since idle started

      // Breathing
      const breathY = Math.sin(idleT * Math.PI / 2) * 3

      // Blinking (every 3-6 seconds ish, deterministic from time)
      const blinkCycle = ((idleT * 1000) % (state.blinkInterval)) / state.blinkInterval
      let blinkScale = 1
      if (blinkCycle > 0.97) {
        const bt = (blinkCycle - 0.97) / 0.03
        blinkScale = bt < 0.5 ? 1 - bt * 2 : (bt - 0.5) * 2
        blinkScale = Math.max(0.04, blinkScale)
      }

      // Emotion: subtle eye size variations
      const emotionCycle = (idleT % state.emotionDuration) / state.emotionDuration
      const emotionPhase = Math.floor(idleT / state.emotionDuration) % 5

      let eyeWMod = 1, eyeHMod = 1, eyeXShift = 0, headTilt = 0

      switch (emotionPhase) {
        case 0: // idle
          break
        case 1: // curious — one eye bigger, slight tilt
          eyeWMod = 0.95
          eyeHMod = 1.05
          eyeXShift = 4
          headTilt = 0.03
          break
        case 2: // happy — squinted (shorter, wider)
          eyeWMod = 1.15
          eyeHMod = 0.5
          break
        case 3: // thinking — eyes drift
          eyeXShift = 8
          eyeHMod = 0.9
          break
        case 4: // content — slightly smaller
          eyeWMod = 0.92
          eyeHMod = 0.85
          break
      }

      // Smooth transitions between emotions
      const transT = Math.min(emotionCycle * 4, 1) // first 25% is transition
      const smoothMod = (target: number) => 1 + (target - 1) * transT

      const finalEyeW = EYE_W * smoothMod(eyeWMod)
      const finalEyeH = EYE_H * smoothMod(eyeHMod) * blinkScale
      const finalShift = eyeXShift * transT

      ctx.save()
      ctx.translate(CX, CY + breathY)
      ctx.rotate(headTilt * transT)
      ctx.globalAlpha = 1

      drawEye(-EYE_GAP / 2 - finalEyeW + finalShift, -finalEyeH / 2, finalEyeW, finalEyeH)
      drawEye(EYE_GAP / 2 + finalShift, -finalEyeH / 2, finalEyeW, finalEyeH)

      ctx.restore()
    }

    animRef.current = requestAnimationFrame(draw)
  }, [])

  const stateRef = useRef({
    startTime: 0,
    blinkInterval: 4200 + Math.random() * 2000,
    emotionDuration: 10 + Math.random() * 8,
  })

  useEffect(() => {
    stateRef.current.startTime = performance.now()
    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
