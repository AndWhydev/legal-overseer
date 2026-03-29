'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import type { AvatarEmotion } from '../chat/use-avatar-emotion'

/**
 * BitBit ASCII Avatar — universal entity icon used across the entire app.
 *
 * Renders the BitBit face (brows, eyes, nose, mouth) procedurally on a
 * canvas, converts to ASCII characters, and displays as a <pre>.
 *
 * Works at any size:
 *  - Large (login panel, onboarding): full detail, all features visible
 *  - Medium (sidebar, splash, 48-72px): compact grid, recognizable face
 *  - Small (chat avatar, 28-40px): micro grid, eyes become the anchor
 *
 * Can be driven externally (emotion prop) or self-manage (ambient cycling).
 */

// Re-export for convenience
export type { AvatarEmotion }

interface BitBitAsciiAvatarProps {
  /** Pixel size (width=height for square, or use className for non-square) */
  size?: number
  /** Override the ASCII font size — match surrounding text for visual harmony */
  fontSize?: number
  /** Externally driven emotion — if omitted, cycles ambient emotions */
  emotion?: AvatarEmotion
  /** Additional class names */
  className?: string
  /** Whether the avatar is in a "thinking" state */
  isThinking?: boolean
  /** Inline style overrides */
  style?: React.CSSProperties
  /** Disable animations (static render) */
  static?: boolean
}

// ─── Face geometry (0-100 coordinate space) ───
// Features compact — nose tucked between eyes, mouth close below
const F = {
  eyeY: 42, leftEyeX: 34, rightEyeX: 66,
  eyeW: 8, eyeH: 7,
  browY: 31, leftBrowCx: 34, rightBrowCx: 66, browSpan: 9,
  noseX: 50, noseY1: 44, noseY2: 50, noseKickX: 54,
  mouthY: 59, mouthCx: 50,
}

// ─── Compact emotion configs ───
interface EGeo {
  le: { cx: number; sx: number; sy: number }
  re: { cx: number; sx: number; sy: number }
  lb: { dy: number; r: number }
  rb: { dy: number; r: number }
  n: { dy: number; r: number }
  m: { curve: number; w: number; op: number }
}

const E: Record<string, EGeo> = {
  neutral:       { le:{cx:0,sx:1,sy:1},       re:{cx:0,sx:1,sy:1},       lb:{dy:0,r:0},     rb:{dy:0,r:0},     n:{dy:0,r:0},   m:{curve:1.2,w:1,op:0.3} },
  thinking:      { le:{cx:-1,sx:1,sy:1},       re:{cx:-1,sx:1,sy:1},      lb:{dy:-2,r:0},    rb:{dy:-2,r:0},    n:{dy:0,r:0},   m:{curve:-0.5,w:0.9,op:0.3} },
  curious:       { le:{cx:0.5,sx:1.15,sy:1.15},re:{cx:0.5,sx:1.15,sy:1.15},lb:{dy:-3,r:-6},  rb:{dy:-1,r:4},    n:{dy:0,r:2},   m:{curve:0.8,w:0.8,op:0.25} },
  happy:         { le:{cx:0,sx:1.05,sy:0.6},   re:{cx:0,sx:1.05,sy:0.6},  lb:{dy:1,r:-3},    rb:{dy:1,r:3},     n:{dy:0.3,r:0}, m:{curve:3.5,w:1.3,op:0.55} },
  concerned:     { le:{cx:0,sx:0.9,sy:0.9},    re:{cx:0,sx:0.9,sy:0.9},   lb:{dy:-1,r:10},   rb:{dy:-1,r:-10},  n:{dy:0,r:-2},  m:{curve:-2,w:1,op:0.4} },
  focused:       { le:{cx:0,sx:1,sy:0.75},     re:{cx:0,sx:1,sy:0.75},    lb:{dy:2,r:2},     rb:{dy:2,r:-2},    n:{dy:0,r:0},   m:{curve:0,w:0.8,op:0.25} },
  surprised:     { le:{cx:0,sx:1.35,sy:1.35},  re:{cx:0,sx:1.35,sy:1.35}, lb:{dy:-4,r:0},    rb:{dy:-4,r:0},    n:{dy:0.5,r:0}, m:{curve:-1.5,w:0.7,op:0.4} },
  processing:    { le:{cx:0,sx:1,sy:1},        re:{cx:0,sx:1,sy:1},       lb:{dy:-1,r:0},    rb:{dy:-1,r:0},    n:{dy:0,r:0},   m:{curve:0.3,w:0.8,op:0.25} },
  contemplating: { le:{cx:1.5,sx:1,sy:0.9},    re:{cx:1.5,sx:1,sy:1.05},  lb:{dy:-1,r:3},    rb:{dy:-2,r:-2},   n:{dy:0,r:3},   m:{curve:0.5,w:0.8,op:0.25} },
  amused:        { le:{cx:0,sx:1.1,sy:0.55},   re:{cx:0,sx:1.1,sy:0.7},   lb:{dy:0,r:-5},    rb:{dy:-1,r:5},    n:{dy:0.3,r:0}, m:{curve:3,w:1.1,op:0.5} },
  determined:    { le:{cx:0,sx:1.05,sy:0.7},   re:{cx:0,sx:1.05,sy:0.7},  lb:{dy:2,r:6},     rb:{dy:2,r:-6},    n:{dy:0,r:0},   m:{curve:0,w:0.8,op:0.3} },
  skeptical:     { le:{cx:0,sx:1,sy:1.1},      re:{cx:0,sx:0.95,sy:0.75}, lb:{dy:-2,r:-8},   rb:{dy:1,r:5},     n:{dy:0,r:-3},  m:{curve:-1,w:0.9,op:0.35} },
  excited:       { le:{cx:0,sx:1.25,sy:1.25},  re:{cx:0,sx:1.25,sy:1.25}, lb:{dy:-3.5,r:-4}, rb:{dy:-3.5,r:4},  n:{dy:0,r:0},   m:{curve:4,w:1.4,op:0.6} },
  drowsy:        { le:{cx:0,sx:1,sy:0.35},     re:{cx:0,sx:1,sy:0.4},     lb:{dy:2.5,r:3},   rb:{dy:2.5,r:-3},  n:{dy:0.5,r:0}, m:{curve:-0.3,w:0.7,op:0.2} },
  alert:         { le:{cx:0,sx:1.2,sy:1.2},    re:{cx:0,sx:1.2,sy:1.2},   lb:{dy:-2.5,r:0},  rb:{dy:-2.5,r:0},  n:{dy:0,r:0},   m:{curve:0.2,w:0.8,op:0.25} },
  mischievous:   { le:{cx:0.5,sx:1,sy:0.65},   re:{cx:0.5,sx:1.1,sy:1},   lb:{dy:1,r:8},     rb:{dy:-2.5,r:-3}, n:{dy:0,r:3},   m:{curve:2.5,w:1.1,op:0.45} },
  serene:        { le:{cx:0,sx:1,sy:0.5},      re:{cx:0,sx:1,sy:0.5},     lb:{dy:1,r:-2},    rb:{dy:1,r:2},     n:{dy:0.2,r:0}, m:{curve:1.8,w:1,op:0.35} },
  confused:      { le:{cx:-0.5,sx:1.15,sy:1.15},re:{cx:0.5,sx:0.9,sy:0.9},lb:{dy:-2.5,r:-10},rb:{dy:0,r:8},     n:{dy:0,r:-3},  m:{curve:-1.2,w:0.8,op:0.35} },
  proud:         { le:{cx:0,sx:1,sy:0.65},     re:{cx:0,sx:1,sy:0.65},    lb:{dy:-1.5,r:-5}, rb:{dy:-1.5,r:5},  n:{dy:-0.3,r:0},m:{curve:2,w:1.1,op:0.4} },
  attentive:     { le:{cx:0,sx:1.1,sy:1.1},    re:{cx:0,sx:1.1,sy:1.1},   lb:{dy:-1.5,r:0},  rb:{dy:-1.5,r:0},  n:{dy:0,r:0},   m:{curve:0.5,w:0.8,op:0.25} },
  annoyed:       { le:{cx:0,sx:0.85,sy:0.5},   re:{cx:0,sx:0.85,sy:0.5},  lb:{dy:3,r:12},    rb:{dy:3,r:-12},   n:{dy:0,r:-5},  m:{curve:-1.8,w:1,op:0.45} },
  sleeping:      { le:{cx:0,sx:1.1,sy:0.08},   re:{cx:0,sx:1.1,sy:0.08},  lb:{dy:3.5,r:4},   rb:{dy:3.5,r:-4},  n:{dy:0.8,r:0}, m:{curve:0.5,w:0.7,op:0.15} },
  startled:      { le:{cx:0,sx:1.5,sy:1.5},    re:{cx:0,sx:1.5,sy:1.5},   lb:{dy:-5,r:-3},   rb:{dy:-5,r:3},    n:{dy:0.8,r:0}, m:{curve:-2,w:0.8,op:0.5} },
  bored:         { le:{cx:1.5,sx:1,sy:0.55},   re:{cx:1.5,sx:1,sy:0.6},   lb:{dy:2,r:2},     rb:{dy:2,r:-2},    n:{dy:0.3,r:2}, m:{curve:-0.5,w:0.8,op:0.25} },
  patient:       { le:{cx:0,sx:1,sy:0.85},     re:{cx:0,sx:1,sy:0.85},    lb:{dy:0.5,r:-1},  rb:{dy:0.5,r:1},   n:{dy:0.1,r:0}, m:{curve:0.8,w:0.9,op:0.3} },
  impressed:     { le:{cx:0,sx:1.3,sy:1.3},    re:{cx:0,sx:1.3,sy:1.3},   lb:{dy:-3.5,r:-2}, rb:{dy:-3.5,r:2},  n:{dy:0,r:0},   m:{curve:1.5,w:1,op:0.35} },
  relieved:      { le:{cx:0,sx:1.05,sy:0.45},  re:{cx:0,sx:1.05,sy:0.45}, lb:{dy:1.5,r:-4},  rb:{dy:1.5,r:4},   n:{dy:0.4,r:0}, m:{curve:2.5,w:1.1,op:0.4} },
  shy:           { le:{cx:-1,sx:0.9,sy:0.7},   re:{cx:-1,sx:1,sy:0.85},   lb:{dy:0,r:5},     rb:{dy:-1.5,r:-3}, n:{dy:0,r:-4},  m:{curve:1,w:0.7,op:0.25} },
  playful:       { le:{cx:0.5,sx:1.2,sy:1.2},  re:{cx:0.5,sx:0.9,sy:0.6}, lb:{dy:-2,r:-6},   rb:{dy:0,r:4},     n:{dy:0,r:4},   m:{curve:3,w:1.2,op:0.5} },
  suspicious:    { le:{cx:1,sx:0.9,sy:0.55},   re:{cx:1,sx:1.1,sy:1},     lb:{dy:1.5,r:6},   rb:{dy:-2,r:-2},   n:{dy:0,r:-2},  m:{curve:-0.8,w:0.8,op:0.3} },
  zen:           { le:{cx:0,sx:1,sy:0.12},     re:{cx:0,sx:1,sy:0.12},    lb:{dy:2,r:-3},    rb:{dy:2,r:3},     n:{dy:0.3,r:0}, m:{curve:1.5,w:0.9,op:0.3} },
}

const CHARSET = ' .\'`^",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'

// Ambient emotion pools
const AMBIENT_DAY: AvatarEmotion[] = [
  'neutral', 'serene', 'neutral', 'contemplating', 'neutral',
  'attentive', 'neutral', 'serene', 'neutral', 'curious', 'neutral',
]
const AMBIENT_NIGHT: AvatarEmotion[] = [
  'neutral', 'serene', 'zen', 'neutral', 'drowsy',
  'serene', 'neutral', 'zen', 'neutral', 'contemplating', 'neutral',
]
const SLEEP_APPROACH: AvatarEmotion[] = ['drowsy', 'serene', 'drowsy', 'zen', 'sleeping']
const WAKE_SEQUENCE: AvatarEmotion[] = ['startled', 'alert', 'confused', 'neutral']

// ─── Helpers ───
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

interface FaceFrame {
  leCx: number; leSx: number; leSy: number
  reCx: number; reSx: number; reSy: number
  lbDy: number; lbR: number; rbDy: number; rbR: number
  nDy: number; nR: number
  mCurve: number; mW: number; mOp: number
  headTilt: number; eyeOx: number; eyeOy: number
  blink: number; breath: number; wake: number
}

function createFrame(): FaceFrame {
  return {
    leCx:0, leSx:1, leSy:1, reCx:0, reSx:1, reSy:1,
    lbDy:0, lbR:0, rbDy:0, rbR:0, nDy:0, nR:0,
    mCurve:0.3, mW:0.8, mOp:0.1,
    headTilt:0, eyeOx:0, eyeOy:0, blink:1, breath:0, wake:1,
  }
}

function drawFace(ctx: CanvasRenderingContext2D, W: number, H: number, f: FaceFrame, isDark: boolean, showNoseMouth: boolean, transparentBg = false) {
  const s = W / 100
  const oy = (H / 2) - (45 * s)
  const faceColor = isDark ? '#e5e5e5' : '#1a1a1a'
  const scanColor = isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)'

  if (transparentBg) {
    ctx.clearRect(0, 0, W, H)
  } else {
    ctx.fillStyle = isDark ? '#000000' : '#fafafa'
    ctx.fillRect(0, 0, W, H)
  }
  ctx.globalAlpha = f.wake

  ctx.save()
  ctx.translate(0, oy)
  ctx.translate(W / 2, 50 * s)
  ctx.rotate(f.headTilt * Math.PI / 180)
  ctx.translate(-W / 2, -50 * s + Math.sin(f.breath) * 1.2 * s)

  // Eyes
  const eyeOx = f.eyeOx * s, eyeOy = f.eyeOy * s
  const leX = (F.leftEyeX + f.leCx) * s + eyeOx
  const leY = F.eyeY * s + eyeOy
  const leW = F.eyeW * f.leSx * s, leH = F.eyeH * f.leSy * f.blink * s
  const reX = (F.rightEyeX + f.reCx) * s + eyeOx
  const reY = F.eyeY * s + eyeOy
  const reW = F.eyeW * f.reSx * s, reH = F.eyeH * f.reSy * f.blink * s

  ctx.shadowColor = faceColor
  ctx.shadowBlur = 2 * s
  ctx.fillStyle = faceColor
  ctx.fillRect(leX - leW / 2, leY - leH / 2, leW, leH)
  ctx.fillRect(reX - reW / 2, reY - reH / 2, reW, reH)
  ctx.shadowBlur = 0

  // Scanlines on eyes
  ctx.fillStyle = scanColor
  const scanGap = Math.max(2, 3 * s)
  for (let ly = leY - leH / 2; ly < leY + leH / 2; ly += scanGap * 2) {
    ctx.fillRect(leX - leW / 2, ly, leW, Math.max(1, s * 0.8))
  }
  for (let ly = reY - reH / 2; ly < reY + reH / 2; ly += scanGap * 2) {
    ctx.fillRect(reX - reW / 2, ly, reW, Math.max(1, s * 0.8))
  }

  // Pupils — use bg color for solid bg (ASCII mode) or destination-out for transparent
  if (transparentBg) {
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'white'
  } else {
    ctx.fillStyle = isDark ? '#000000' : '#fafafa'
  }
  const drawPupil = (ex: number, ey: number, ew: number, eh: number) => {
    if (eh < 0.5 * s) return
    const pw = ew * 0.4
    const ph = eh * 0.5
    const px = ex + f.eyeOx * s * 0.5
    const py = ey + f.eyeOy * s * 0.3
    const cx = Math.max(ex - ew / 2 + pw / 2, Math.min(ex + ew / 2 - pw / 2, px))
    const cy = Math.max(ey - eh / 2 + ph / 2, Math.min(ey + eh / 2 - ph / 2, py))
    ctx.fillRect(cx - pw / 2, cy - ph / 2, pw, ph)
  }
  drawPupil(leX, leY, leW, leH)
  drawPupil(reX, reY, reW, reH)
  if (transparentBg) ctx.restore()

  // Brows
  ctx.strokeStyle = faceColor
  ctx.lineWidth = Math.max(2, 3.5 * s)
  ctx.lineCap = 'round'

  ctx.save()
  ctx.translate(F.leftBrowCx * s + eyeOx, (F.browY + f.lbDy) * s + eyeOy)
  ctx.rotate(f.lbR * Math.PI / 180)
  ctx.beginPath()
  ctx.moveTo(-F.browSpan * s, 1.5 * s)
  ctx.quadraticCurveTo(0, -2 * s, F.browSpan * s, 1.5 * s)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.translate(F.rightBrowCx * s + eyeOx, (F.browY + f.rbDy) * s + eyeOy)
  ctx.rotate(f.rbR * Math.PI / 180)
  ctx.beginPath()
  ctx.moveTo(-F.browSpan * s, 1.5 * s)
  ctx.quadraticCurveTo(0, -2 * s, F.browSpan * s, 1.5 * s)
  ctx.stroke()
  ctx.restore()

  // Nose + mouth only at large enough sizes
  if (showNoseMouth) {
    ctx.globalAlpha = f.wake * 0.6
    ctx.strokeStyle = faceColor
    ctx.lineWidth = Math.max(1, 1.3 * s)
    ctx.lineJoin = 'round'
    ctx.save()
    ctx.translate(F.noseX * s, (F.noseY1 + f.nDy) * s)
    ctx.rotate(f.nR * Math.PI / 180)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, (F.noseY2 - F.noseY1) * s)
    ctx.lineTo((F.noseKickX - F.noseX) * s, (F.noseY2 - F.noseY1) * s)
    ctx.stroke()
    ctx.restore()
    ctx.globalAlpha = f.wake

    if (f.mOp > 0.01) {
      const prevAlpha = ctx.globalAlpha
      ctx.globalAlpha = f.wake * f.mOp
      ctx.strokeStyle = faceColor
      ctx.lineWidth = Math.max(3, 4.5 * s)
      ctx.lineCap = 'round'
      const mw = 10 * f.mW * s
      ctx.beginPath()
      ctx.moveTo(F.mouthCx * s - mw, F.mouthY * s)
      ctx.quadraticCurveTo(F.mouthCx * s, (F.mouthY + f.mCurve) * s, F.mouthCx * s + mw, F.mouthY * s)
      ctx.stroke()
      ctx.globalAlpha = prevAlpha
    }
  }

  ctx.restore()
  ctx.globalAlpha = 1
}

function asciify(src: HTMLCanvasElement, sCtx: CanvasRenderingContext2D, cols: number, rows: number): string {
  sCtx.clearRect(0, 0, cols, rows)
  sCtx.drawImage(src, 0, 0, cols, rows)
  const d = sCtx.getImageData(0, 0, cols, rows).data
  let str = ''
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (x + y * cols) * 4
      if (d[i + 3] === 0) { str += ' '; continue }
      const gray = (0.3 * d[i] + 0.6 * d[i + 1] + 0.1 * d[i + 2]) / 255
      str += CHARSET[Math.floor(gray * (CHARSET.length - 1))]
    }
    str += '\n'
  }
  return str
}

// ═══════════════════════════════════════
// Component
// ═══════════════════════════════════════
export function BitBitAsciiAvatar({
  size,
  fontSize: fontSizeProp,
  emotion: externalEmotion,
  className,
  isThinking = false,
  style,
  static: isStatic = false,
}: BitBitAsciiAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const drawRef = useRef<HTMLCanvasElement>(null)
  const sampleRef = useRef<HTMLCanvasElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const animRef = useRef(0)
  const smallAnimRef = useRef(0)
  const faceRef = useRef(createFrame())
  const emotionRef = useRef<string>('neutral')
  const isBlinkingRef = useRef(false)

  const [isDark, setIsDark] = useState(true)
  const [grid, setGrid] = useState({ cols: 20, rows: 14, drawW: 100, drawH: 70, fontSize: 14 })

  // Interactive behavior refs
  const targetEyeOffsetRef = useRef({ x: 0, y: 0 })
  const targetHeadTiltRef = useRef(0)
  const lastMouseMoveRef = useRef(Date.now())
  const sleepStageRef = useRef(0) // 0=awake, 1=drowsy, 2=sleeping
  const isWakingRef = useRef(false)
  const formOverrideRef = useRef(false)
  const clickCountRef = useRef(0)
  const clickResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ambientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snifflePhaseRef = useRef(0)

  // Dark mode
  useEffect(() => {
    const check = () => {
      setIsDark(
        document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches
      )
    }
    check()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', check)
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { mq.removeEventListener('change', check); obs.disconnect() }
  }, [])

  // Calculate grid from container size
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width === 0 || height === 0) return

      // Font size: use prop if provided, otherwise auto-calculate from container
      let fontSize: number
      if (fontSizeProp) {
        fontSize = fontSizeProp
      } else if (width <= 48) fontSize = 3
      else if (width <= 80) fontSize = 4
      else if (width <= 140) fontSize = 6
      else if (width <= 250) fontSize = 8
      else fontSize = 14

      const charW = fontSize * 0.6
      const cols = Math.max(6, Math.floor(width / charW))
      const rows = Math.max(4, Math.floor(height / fontSize))

      setGrid({
        cols: Math.min(cols, 80),
        rows: Math.min(rows, 55),
        drawW: Math.min(cols, 80) * 5,
        drawH: Math.min(rows, 55) * 5,
        fontSize,
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Emotion helpers
  const setEmotionDirect = useCallback((e: string) => { emotionRef.current = e }, [])
  const setEmotionSmooth = useCallback((e: string, delay = 400) => {
    if (e === emotionRef.current) return
    setTimeout(() => { emotionRef.current = e }, delay)
  }, [])

  // Sync external emotion
  useEffect(() => {
    if (externalEmotion) emotionRef.current = externalEmotion
  }, [externalEmotion])

  // Ambient cycling with day/night pools (only when no external emotion)
  useEffect(() => {
    if (externalEmotion || isStatic) return
    if (sleepStageRef.current > 0 || isWakingRef.current) return
    const hour = new Date().getHours()
    const isNight = hour >= 23 || hour < 5
    const pool = isNight ? AMBIENT_NIGHT : AMBIENT_DAY
    const interval = isNight ? 7000 : 6000
    let idx = 0
    emotionRef.current = pool[0]
    const cycle = () => {
      if (formOverrideRef.current || sleepStageRef.current > 0 || isWakingRef.current) return
      idx = (idx + 1) % pool.length
      emotionRef.current = pool[idx]
      ambientTimerRef.current = setTimeout(cycle, interval + Math.random() * 2000)
    }
    ambientTimerRef.current = setTimeout(cycle, interval + Math.random() * 1500)
    return () => { if (ambientTimerRef.current) clearTimeout(ambientTimerRef.current) }
  }, [externalEmotion, isStatic])

  // Blinking
  useEffect(() => {
    if (isStatic) return
    let timer: ReturnType<typeof setTimeout>
    const scheduleBlink = () => {
      timer = setTimeout(() => {
        isBlinkingRef.current = true
        setTimeout(() => { isBlinkingRef.current = false; scheduleBlink() }, 150)
      }, 2500 + Math.random() * 4000)
    }
    scheduleBlink()
    return () => clearTimeout(timer)
  }, [isStatic])

  // Nose sniffling
  useEffect(() => {
    if (isStatic) return
    let timer: ReturnType<typeof setTimeout>
    const calm = ['neutral', 'serene', 'patient', 'bored', 'contemplating', 'attentive']
    const schedule = () => {
      timer = setTimeout(() => {
        if (calm.includes(emotionRef.current)) {
          snifflePhaseRef.current = 1
          setTimeout(() => { snifflePhaseRef.current = 0; schedule() }, 300)
        } else schedule()
      }, 12000 + Math.random() * 13000)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [isStatic])

  // Cursor tracking (perf-optimized)
  useEffect(() => {
    if (isStatic) return
    let raf = 0
    let last = 0
    let cachedRect: DOMRect | null = null
    let rectAge = 0
    const onMove = (ev: MouseEvent) => {
      const now = Date.now()
      if (now - last < 80) return
      last = now
      lastMouseMoveRef.current = now
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = containerRef.current
        if (!el) return
        if (!cachedRect || now - rectAge > 500) {
          cachedRect = el.getBoundingClientRect()
          rectAge = now
        }
        const cx = cachedRect.left + cachedRect.width / 2
        const cy = cachedRect.top + cachedRect.height / 2
        const dx = ev.clientX - cx
        const dy = ev.clientY - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        const factor = Math.min(dist / 250, 1)
        const angle = Math.atan2(dy, dx)
        targetEyeOffsetRef.current = {
          x: Math.cos(angle) * factor * 3,
          y: Math.sin(angle) * factor * 2,
        }
        targetHeadTiltRef.current = (dx / window.innerWidth) * 5
      })
    }
    document.addEventListener('mousemove', onMove, { passive: true })
    return () => { document.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf) }
  }, [isStatic])

  // Sleep/wake detection
  useEffect(() => {
    if (isStatic || externalEmotion) return
    const handleMove = () => {
      lastMouseMoveRef.current = Date.now()
      if (sleepStageRef.current > 0 && !isWakingRef.current) {
        isWakingRef.current = true; sleepStageRef.current = 0; formOverrideRef.current = true
        if (ambientTimerRef.current) { clearTimeout(ambientTimerRef.current); ambientTimerRef.current = null }
        let step = 0
        const playWake = () => {
          if (step < WAKE_SEQUENCE.length) {
            setEmotionDirect(WAKE_SEQUENCE[step]); step++
            wakeTimerRef.current = setTimeout(playWake, step === 1 ? 400 : 800)
          } else { isWakingRef.current = false; formOverrideRef.current = false }
        }
        playWake()
      }
    }
    const checkSleep = () => {
      if (formOverrideRef.current || isWakingRef.current) { sleepTimerRef.current = setTimeout(checkSleep, 5000); return }
      const idle = Date.now() - lastMouseMoveRef.current
      if (idle > 40000 && sleepStageRef.current < 2) {
        sleepStageRef.current = 2; setEmotionSmooth('sleeping', 600)
      } else if (idle > 20000 && sleepStageRef.current < 1) {
        sleepStageRef.current = 1
        let idx = 0
        const drift = () => {
          if (sleepStageRef.current < 1) return
          if (idx < SLEEP_APPROACH.length) { setEmotionDirect(SLEEP_APPROACH[idx]); idx++; ambientTimerRef.current = setTimeout(drift, 4000 + Math.random() * 2000) }
        }
        drift()
      }
      sleepTimerRef.current = setTimeout(checkSleep, 5000)
    }
    document.addEventListener('mousemove', handleMove, { passive: true })
    sleepTimerRef.current = setTimeout(checkSleep, 5000)
    return () => { document.removeEventListener('mousemove', handleMove); if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current); if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current) }
  }, [isStatic, externalEmotion, setEmotionDirect, setEmotionSmooth])

  // Click reactions
  const handleClick = useCallback(() => {
    if (isStatic) return
    clickCountRef.current++
    const count = clickCountRef.current
    if (clickResetRef.current) clearTimeout(clickResetRef.current)
    clickResetRef.current = setTimeout(() => { clickCountRef.current = 0 }, 2000)
    if (count >= 6) {
      formOverrideRef.current = true; setEmotionDirect('annoyed')
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      clickTimerRef.current = setTimeout(() => {
        setEmotionDirect('skeptical')
        clickTimerRef.current = setTimeout(() => { formOverrideRef.current = false; setEmotionSmooth('neutral', 500) }, 1500)
      }, 2500)
    } else if (count === 2) {
      formOverrideRef.current = true; setEmotionDirect('playful')
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      clickTimerRef.current = setTimeout(() => {
        formOverrideRef.current = false; setEmotionSmooth('happy', 300)
        clickTimerRef.current = setTimeout(() => setEmotionSmooth('neutral', 500), 1000)
      }, 1200)
    } else if (count === 1) {
      formOverrideRef.current = true; setEmotionDirect('surprised')
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      clickTimerRef.current = setTimeout(() => {
        setEmotionDirect('happy')
        clickTimerRef.current = setTimeout(() => { formOverrideRef.current = false; setEmotionSmooth('neutral', 500) }, 1200)
      }, 600)
    }
  }, [isStatic, setEmotionDirect, setEmotionSmooth])

  // Cleanup all timers
  useEffect(() => {
    return () => {
      [ambientTimerRef, sleepTimerRef, wakeTimerRef, clickTimerRef, clickResetRef]
        .forEach(r => { if (r.current) clearTimeout(r.current) })
    }
  }, [])

  // Dimension calculations — fontSize prop overrides auto-calculation
  // Canvas mode for ≤120px — ASCII text is illegible below this
  const isSmall = (size ?? 100) <= 120
  const internalFontSize = fontSizeProp ?? (isSmall ? 6 : grid.fontSize)
  const internalCols = isSmall ? 40 : grid.cols
  const internalRows = isSmall ? 32 : grid.rows
  const internalDrawW = isSmall ? 200 : grid.drawW
  const internalDrawH = isSmall ? 160 : grid.drawH

  // Animation loop
  useEffect(() => {
    const draw = drawRef.current
    const sample = sampleRef.current
    if (!draw || !sample) return

    const cols = isSmall ? internalCols : grid.cols
    const rows = isSmall ? internalRows : grid.rows
    const dw = isSmall ? internalDrawW : grid.drawW
    const dh = isSmall ? internalDrawH : grid.drawH

    draw.width = dw
    draw.height = dh
    sample.width = cols
    sample.height = rows

    const dCtx = draw.getContext('2d', { willReadFrequently: true })
    const sCtx = sample.getContext('2d', { willReadFrequently: true })
    if (!dCtx || !sCtx) return
    sCtx.imageSmoothingEnabled = false

    const showNoseMouth = internalFontSize >= 6 // only show at medium+ sizes

    const animate = () => {
      const face = faceRef.current
      const target = E[emotionRef.current] || E.neutral
      const t = 0.08

      face.leCx = lerp(face.leCx, target.le.cx, t)
      face.leSx = lerp(face.leSx, target.le.sx, t)
      face.leSy = lerp(face.leSy, target.le.sy, t)
      face.reCx = lerp(face.reCx, target.re.cx, t)
      face.reSx = lerp(face.reSx, target.re.sx, t)
      face.reSy = lerp(face.reSy, target.re.sy, t)
      face.lbDy = lerp(face.lbDy, target.lb.dy, t)
      face.lbR = lerp(face.lbR, target.lb.r, t)
      face.rbDy = lerp(face.rbDy, target.rb.dy, t)
      face.rbR = lerp(face.rbR, target.rb.r, t)
      face.nDy = lerp(face.nDy, target.n.dy, t)
      face.nR = lerp(face.nR, target.n.r, t)
      face.mCurve = lerp(face.mCurve, target.m.curve, t)
      face.mW = lerp(face.mW, target.m.w, t)
      face.mOp = lerp(face.mOp, target.m.op, t)
      face.blink = lerp(face.blink, isBlinkingRef.current ? 0.08 : 1, isBlinkingRef.current ? 0.35 : 0.2)
      face.breath += 0.025

      // Cursor tracking
      face.eyeOx = lerp(face.eyeOx, targetEyeOffsetRef.current.x, 0.12)
      face.eyeOy = lerp(face.eyeOy, targetEyeOffsetRef.current.y, 0.12)
      face.headTilt = lerp(face.headTilt, targetHeadTiltRef.current, 0.12)

      // Nose sniffle
      if (snifflePhaseRef.current > 0) {
        face.nDy += Math.sin(snifflePhaseRef.current * 10) * 0.5
        face.nR += Math.sin(snifflePhaseRef.current * 8) * 1.5
      }

      drawFace(dCtx, dw, dh, face, isDark, showNoseMouth)
      const str = asciify(draw, sCtx, cols, rows)
      if (preRef.current) preRef.current.textContent = str

      if (!isStatic) animRef.current = requestAnimationFrame(animate)
    }

    if (isStatic) {
      // Single frame render
      const target = E[emotionRef.current] || E.neutral
      const face = faceRef.current
      Object.assign(face, {
        leCx: target.le.cx, leSx: target.le.sx, leSy: target.le.sy,
        reCx: target.re.cx, reSx: target.re.sx, reSy: target.re.sy,
        lbDy: target.lb.dy, lbR: target.lb.r, rbDy: target.rb.dy, rbR: target.rb.r,
        nDy: target.n.dy, nR: target.n.r,
        mCurve: target.m.curve, mW: target.m.w, mOp: target.m.op,
        blink: 1, wake: 1,
      })
      drawFace(dCtx, dw, dh, face, isDark, showNoseMouth)
      const str = asciify(draw, sCtx, cols, rows)
      if (preRef.current) preRef.current.textContent = str
    } else {
      animRef.current = requestAnimationFrame(animate)
    }

    return () => cancelAnimationFrame(animRef.current)
  }, [isDark, grid, isStatic, isSmall, internalCols, internalRows, internalDrawW, internalDrawH, internalFontSize])

  const sizeStyle: React.CSSProperties = size
    ? { width: size, height: size }
    : {}

  // For small sizes: render face at high-res, convert to ASCII, then
  // rasterize those characters onto a visible canvas — preserves the
  // ASCII texture/identity at miniature scale
  const smallCanvasRef = useRef<HTMLCanvasElement>(null)
  const hiResRef = useRef<HTMLCanvasElement | null>(null)
  const hiSampleRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!isSmall) return
    const canvas = smallCanvasRef.current
    if (!canvas) return
    const s = size ?? 96
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    canvas.width = s * dpr
    canvas.height = s * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // Create high-res off-screen canvases for face drawing + ASCII sampling
    if (!hiResRef.current) hiResRef.current = document.createElement('canvas')
    if (!hiSampleRef.current) hiSampleRef.current = document.createElement('canvas')
    const hiRes = hiResRef.current
    const hiSample = hiSampleRef.current

    // Internal ASCII grid — same resolution as the login face
    const iCols = 35
    const iRows = 24
    hiRes.width = iCols * 5
    hiRes.height = iRows * 5
    hiSample.width = iCols
    hiSample.height = iRows
    const hiCtx = hiRes.getContext('2d', { willReadFrequently: true })
    const hiSCtx = hiSample.getContext('2d', { willReadFrequently: true })
    if (!hiCtx || !hiSCtx) return
    hiSCtx.imageSmoothingEnabled = false

    // Calculate how to fit the ASCII grid onto the visible canvas
    const charW = s / iCols
    const charH = s / iRows
    const fontSize = Math.max(2, charH * 0.9)
    const faceColor = isDark ? '#e5e5e5' : '#1a1a1a'

    const face = faceRef.current
    const animate = () => {
      const target = E[emotionRef.current] || E.neutral
      const t = 0.08
      face.leCx = lerp(face.leCx, target.le.cx, t)
      face.leSx = lerp(face.leSx, target.le.sx, t)
      face.leSy = lerp(face.leSy, target.le.sy, t)
      face.reCx = lerp(face.reCx, target.re.cx, t)
      face.reSx = lerp(face.reSx, target.re.sx, t)
      face.reSy = lerp(face.reSy, target.re.sy, t)
      face.lbDy = lerp(face.lbDy, target.lb.dy, t)
      face.lbR = lerp(face.lbR, target.lb.r, t)
      face.rbDy = lerp(face.rbDy, target.rb.dy, t)
      face.rbR = lerp(face.rbR, target.rb.r, t)
      face.nDy = lerp(face.nDy, target.n.dy, t)
      face.nR = lerp(face.nR, target.n.r, t)
      face.mCurve = lerp(face.mCurve, target.m.curve, t)
      face.mW = lerp(face.mW, target.m.w, t)
      face.mOp = lerp(face.mOp, target.m.op, t)
      face.blink = lerp(face.blink, isBlinkingRef.current ? 0.08 : 1, isBlinkingRef.current ? 0.35 : 0.2)
      face.breath += 0.025
      face.eyeOx = lerp(face.eyeOx, targetEyeOffsetRef.current.x, 0.12)
      face.eyeOy = lerp(face.eyeOy, targetEyeOffsetRef.current.y, 0.12)
      face.headTilt = lerp(face.headTilt, targetHeadTiltRef.current, 0.12)

      if (isThinking) {
        const scanT = face.breath * 2
        face.eyeOx = Math.sin(scanT) * 1.5
        face.eyeOy = Math.sin(scanT * 0.7) * 0.5
      }

      // 1. Draw face at high resolution
      hiCtx.fillStyle = isDark ? '#000000' : '#fafafa'
      hiCtx.fillRect(0, 0, hiRes.width, hiRes.height)
      drawFace(hiCtx, hiRes.width, hiRes.height, face, isDark, true)

      // 2. Convert to ASCII
      const asciiStr = asciify(hiRes, hiSCtx, iCols, iRows)
      const lines = asciiStr.split('\n')

      // 3. Rasterize ASCII characters onto the visible canvas
      ctx.clearRect(0, 0, s, s)
      ctx.font = `${fontSize}px 'Courier New', monospace`
      ctx.textBaseline = 'top'
      ctx.fillStyle = faceColor

      for (let row = 0; row < lines.length; row++) {
        const line = lines[row]
        if (!line) continue
        for (let col = 0; col < line.length; col++) {
          if (line[col] !== ' ') {
            ctx.fillText(line[col], col * charW, row * charH)
          }
        }
      }

      if (!isStatic) smallAnimRef.current = requestAnimationFrame(animate)
    }
    if (isStatic) {
      const target = E[emotionRef.current] || E.neutral
      Object.assign(face, {
        leCx: target.le.cx, leSx: target.le.sx, leSy: target.le.sy,
        reCx: target.re.cx, reSx: target.re.sx, reSy: target.re.sy,
        lbDy: target.lb.dy, lbR: target.lb.r, rbDy: target.rb.dy, rbR: target.rb.r,
        nDy: target.n.dy, nR: target.n.r,
        mCurve: target.m.curve, mW: target.m.w, mOp: target.m.op,
        blink: 1, wake: 1,
      })
    }
    smallAnimRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(smallAnimRef.current)
  }, [isDark, isSmall, size, isStatic])

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={handleClick}
      suppressHydrationWarning
      style={{
        position: 'relative',
        overflow: 'hidden',
        cursor: isStatic ? undefined : 'pointer',
        ...sizeStyle,
        ...style,
      }}
    >
      <canvas ref={drawRef} style={{ display: 'none' }} />
      <canvas ref={sampleRef} style={{ display: 'none' }} />
      {isSmall ? (
        <canvas ref={smallCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      ) : (
        <pre ref={preRef} suppressHydrationWarning style={{ fontFamily: "var(--font-geist-mono), var(--font-bb-mono), ui-monospace, monospace", fontSize: `${internalFontSize}px`, lineHeight: '1em', letterSpacing: '0.02em', color: isDark ? '#e5e5e5' : '#1a1a1a', textShadow: isDark && internalFontSize >= 8 ? '0 0 6px rgba(229,229,229,0.15), 0 0 2px rgba(229,229,229,0.1)' : 'none', margin: 0, padding: 0, userSelect: 'none', WebkitUserSelect: 'none', whiteSpace: 'pre', position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 2 }} />
      )}
    </div>
  )
}
