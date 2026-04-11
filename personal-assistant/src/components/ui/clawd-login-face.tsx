'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

// ─── Emotion type (matches chat avatar) ───
export type LoginFaceEmotion =
  | 'neutral' | 'thinking' | 'curious' | 'happy' | 'concerned' | 'focused'
  | 'surprised' | 'processing' | 'contemplating' | 'amused' | 'determined'
  | 'skeptical' | 'excited' | 'drowsy' | 'alert' | 'mischievous' | 'serene'
  | 'confused' | 'proud' | 'attentive' | 'annoyed' | 'sleeping' | 'startled'
  | 'bored' | 'patient' | 'impressed' | 'relieved' | 'shy' | 'playful'
  | 'suspicious' | 'zen'

interface ClawdLoginFaceProps {
  className?: string
  focusedField?: 'email' | 'password' | null
  isHoveringSubmit?: boolean
  hasError?: boolean
  isSubmitting?: boolean
  /** Hide the background, scanlines, and vignette — just the face */
  transparent?: boolean
  /** Skip the wake/head-pivot intro — start in upright idle immediately */
  skipWake?: boolean
  /** Delay before cursor tracking and emotions activate (ms) */
  delayInteractivity?: number
}

// ─── Emotion geometry configs ───
interface EmotionGeo {
  le: { cx: number; sx: number; sy: number } // left eye
  re: { cx: number; sx: number; sy: number } // right eye
  lb: { dy: number; r: number }              // left brow
  rb: { dy: number; r: number }              // right brow
  n: { dy: number; r: number }               // nose
  m: { curve: number; w: number; op: number } // mouth
}

// Compact emotion configs — all 31 emotions
const E: Record<LoginFaceEmotion, EmotionGeo> = {
  neutral:       { le:{cx:0,sx:1,sy:1},       re:{cx:0,sx:1,sy:1},       lb:{dy:0,r:0},     rb:{dy:0,r:0},     n:{dy:0,r:0},   m:{curve:0.3,w:0.8,op:0.1} },
  thinking:      { le:{cx:-1,sx:1,sy:1},       re:{cx:-1,sx:1,sy:1},      lb:{dy:-2,r:0},    rb:{dy:-2,r:0},    n:{dy:0,r:0},   m:{curve:-0.3,w:0.7,op:0.15} },
  curious:       { le:{cx:0.5,sx:1.15,sy:1.15},re:{cx:0.5,sx:1.15,sy:1.15},lb:{dy:-3,r:-6},  rb:{dy:-1,r:4},    n:{dy:0,r:2},   m:{curve:0.5,w:0.6,op:0.12} },
  happy:         { le:{cx:0,sx:1.05,sy:0.6},   re:{cx:0,sx:1.05,sy:0.6},  lb:{dy:1,r:-3},    rb:{dy:1,r:3},     n:{dy:0.3,r:0}, m:{curve:2.5,w:1.2,op:0.45} },
  concerned:     { le:{cx:0,sx:0.9,sy:0.9},    re:{cx:0,sx:0.9,sy:0.9},   lb:{dy:-1,r:10},   rb:{dy:-1,r:-10},  n:{dy:0,r:-2},  m:{curve:-1.5,w:0.9,op:0.3} },
  focused:       { le:{cx:0,sx:1,sy:0.75},     re:{cx:0,sx:1,sy:0.75},    lb:{dy:2,r:2},     rb:{dy:2,r:-2},    n:{dy:0,r:0},   m:{curve:0,w:0.6,op:0.08} },
  surprised:     { le:{cx:0,sx:1.35,sy:1.35},  re:{cx:0,sx:1.35,sy:1.35}, lb:{dy:-4,r:0},    rb:{dy:-4,r:0},    n:{dy:0.5,r:0}, m:{curve:-1,w:0.5,op:0.35} },
  processing:    { le:{cx:0,sx:1,sy:1},        re:{cx:0,sx:1,sy:1},       lb:{dy:-1,r:0},    rb:{dy:-1,r:0},    n:{dy:0,r:0},   m:{curve:0,w:0.7,op:0.1} },
  contemplating: { le:{cx:1.5,sx:1,sy:0.9},    re:{cx:1.5,sx:1,sy:1.05},  lb:{dy:-1,r:3},    rb:{dy:-2,r:-2},   n:{dy:0,r:3},   m:{curve:0.2,w:0.7,op:0.1} },
  amused:        { le:{cx:0,sx:1.1,sy:0.55},   re:{cx:0,sx:1.1,sy:0.7},   lb:{dy:0,r:-5},    rb:{dy:-1,r:5},    n:{dy:0.3,r:0}, m:{curve:2,w:1,op:0.4} },
  determined:    { le:{cx:0,sx:1.05,sy:0.7},   re:{cx:0,sx:1.05,sy:0.7},  lb:{dy:2,r:6},     rb:{dy:2,r:-6},    n:{dy:0,r:0},   m:{curve:0,w:0.7,op:0.15} },
  skeptical:     { le:{cx:0,sx:1,sy:1.1},      re:{cx:0,sx:0.95,sy:0.75}, lb:{dy:-2,r:-8},   rb:{dy:1,r:5},     n:{dy:0,r:-3},  m:{curve:-0.5,w:0.8,op:0.2} },
  excited:       { le:{cx:0,sx:1.25,sy:1.25},  re:{cx:0,sx:1.25,sy:1.25}, lb:{dy:-3.5,r:-4}, rb:{dy:-3.5,r:4},  n:{dy:0,r:0},   m:{curve:2.8,w:1.3,op:0.5} },
  drowsy:        { le:{cx:0,sx:1,sy:0.35},     re:{cx:0,sx:1,sy:0.4},     lb:{dy:2.5,r:3},   rb:{dy:2.5,r:-3},  n:{dy:0.5,r:0}, m:{curve:-0.2,w:0.6,op:0.08} },
  alert:         { le:{cx:0,sx:1.2,sy:1.2},    re:{cx:0,sx:1.2,sy:1.2},   lb:{dy:-2.5,r:0},  rb:{dy:-2.5,r:0},  n:{dy:0,r:0},   m:{curve:0,w:0.7,op:0.1} },
  mischievous:   { le:{cx:0.5,sx:1,sy:0.65},   re:{cx:0.5,sx:1.1,sy:1},   lb:{dy:1,r:8},     rb:{dy:-2.5,r:-3}, n:{dy:0,r:3},   m:{curve:1.8,w:1,op:0.35} },
  serene:        { le:{cx:0,sx:1,sy:0.5},      re:{cx:0,sx:1,sy:0.5},     lb:{dy:1,r:-2},    rb:{dy:1,r:2},     n:{dy:0.2,r:0}, m:{curve:1.2,w:0.9,op:0.25} },
  confused:      { le:{cx:-0.5,sx:1.15,sy:1.15},re:{cx:0.5,sx:0.9,sy:0.9},lb:{dy:-2.5,r:-10},rb:{dy:0,r:8},     n:{dy:0,r:-3},  m:{curve:-0.8,w:0.7,op:0.2} },
  proud:         { le:{cx:0,sx:1,sy:0.65},     re:{cx:0,sx:1,sy:0.65},    lb:{dy:-1.5,r:-5}, rb:{dy:-1.5,r:5},  n:{dy:-0.3,r:0},m:{curve:1.5,w:1,op:0.3} },
  attentive:     { le:{cx:0,sx:1.1,sy:1.1},    re:{cx:0,sx:1.1,sy:1.1},   lb:{dy:-1.5,r:0},  rb:{dy:-1.5,r:0},  n:{dy:0,r:0},   m:{curve:0.2,w:0.7,op:0.08} },
  annoyed:       { le:{cx:0,sx:0.85,sy:0.5},   re:{cx:0,sx:0.85,sy:0.5},  lb:{dy:3,r:12},    rb:{dy:3,r:-12},   n:{dy:0,r:-5},  m:{curve:-1.2,w:0.9,op:0.35} },
  sleeping:      { le:{cx:0,sx:1.1,sy:0.08},   re:{cx:0,sx:1.1,sy:0.08},  lb:{dy:3.5,r:4},   rb:{dy:3.5,r:-4},  n:{dy:0.8,r:0}, m:{curve:0.3,w:0.6,op:0.08} },
  startled:      { le:{cx:0,sx:1.5,sy:1.5},    re:{cx:0,sx:1.5,sy:1.5},   lb:{dy:-5,r:-3},   rb:{dy:-5,r:3},    n:{dy:0.8,r:0}, m:{curve:-1.5,w:0.6,op:0.4} },
  bored:         { le:{cx:1.5,sx:1,sy:0.55},   re:{cx:1.5,sx:1,sy:0.6},   lb:{dy:2,r:2},     rb:{dy:2,r:-2},    n:{dy:0.3,r:2}, m:{curve:-0.3,w:0.7,op:0.12} },
  patient:       { le:{cx:0,sx:1,sy:0.85},     re:{cx:0,sx:1,sy:0.85},    lb:{dy:0.5,r:-1},  rb:{dy:0.5,r:1},   n:{dy:0.1,r:0}, m:{curve:0.5,w:0.8,op:0.12} },
  impressed:     { le:{cx:0,sx:1.3,sy:1.3},    re:{cx:0,sx:1.3,sy:1.3},   lb:{dy:-3.5,r:-2}, rb:{dy:-3.5,r:2},  n:{dy:0,r:0},   m:{curve:1,w:0.9,op:0.25} },
  relieved:      { le:{cx:0,sx:1.05,sy:0.45},  re:{cx:0,sx:1.05,sy:0.45}, lb:{dy:1.5,r:-4},  rb:{dy:1.5,r:4},   n:{dy:0.4,r:0}, m:{curve:1.8,w:1,op:0.3} },
  shy:           { le:{cx:-1,sx:0.9,sy:0.7},   re:{cx:-1,sx:1,sy:0.85},   lb:{dy:0,r:5},     rb:{dy:-1.5,r:-3}, n:{dy:0,r:-4},  m:{curve:0.8,w:0.6,op:0.15} },
  playful:       { le:{cx:0.5,sx:1.2,sy:1.2},  re:{cx:0.5,sx:0.9,sy:0.6}, lb:{dy:-2,r:-6},   rb:{dy:0,r:4},     n:{dy:0,r:4},   m:{curve:2,w:1.1,op:0.4} },
  suspicious:    { le:{cx:1,sx:0.9,sy:0.55},   re:{cx:1,sx:1.1,sy:1},     lb:{dy:1.5,r:6},   rb:{dy:-2,r:-2},   n:{dy:0,r:-2},  m:{curve:-0.5,w:0.7,op:0.18} },
  zen:           { le:{cx:0,sx:1,sy:0.12},     re:{cx:0,sx:1,sy:0.12},    lb:{dy:2,r:-3},    rb:{dy:2,r:3},     n:{dy:0.3,r:0}, m:{curve:1,w:0.8,op:0.2} },
}

// ─── Face drawing geometry (0-100 coordinate space) ───
const F = {
  headX: 20, headY: 10, headW: 60, headH: 70, headR: 12,
  eyeY: 40, leftEyeX: 34, rightEyeX: 66,
  eyeW: 8, eyeH: 7,
  browY: 28, leftBrowCx: 34, rightBrowCx: 66, browSpan: 9,
  noseX: 50, noseY1: 44, noseY2: 50, noseKickX: 54,
  mouthY: 59, mouthCx: 50,
}

// ─── ASCII config ───
const CHARSET = ' .\'`^",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'
const ASCII_FONT_SIZE = 14

// ─── Emotion pools ───
const AMBIENT_DAY: LoginFaceEmotion[] = [
  'neutral', 'serene', 'neutral', 'contemplating', 'neutral',
  'attentive', 'neutral', 'serene', 'neutral', 'curious', 'neutral',
]
const AMBIENT_NIGHT: LoginFaceEmotion[] = [
  'neutral', 'serene', 'zen', 'neutral', 'drowsy',
  'serene', 'neutral', 'zen', 'neutral', 'contemplating', 'neutral',
]
const SLEEP_APPROACH: LoginFaceEmotion[] = ['drowsy', 'serene', 'drowsy', 'zen', 'sleeping']
const WAKE_SEQUENCE: LoginFaceEmotion[] = ['startled', 'alert', 'confused', 'neutral']

// ─── Helpers ───
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ─── Animated face state (interpolated per frame) ───
interface FaceFrame {
  leCx: number; leSx: number; leSy: number
  reCx: number; reSx: number; reSy: number
  lbDy: number; lbR: number
  rbDy: number; rbR: number
  nDy: number; nR: number
  mCurve: number; mW: number; mOp: number
  headTilt: number
  eyeOx: number; eyeOy: number
  blink: number
  breath: number
  wake: number // 0=hidden, 1=fully visible
}

function createFaceFrame(): FaceFrame {
  return {
    leCx:0, leSx:1, leSy:1, reCx:0, reSx:1, reSy:1,
    lbDy:0, lbR:0, rbDy:0, rbR:0,
    nDy:0, nR:0,
    mCurve:0.3, mW:0.8, mOp:0.1,
    headTilt:0, eyeOx:0, eyeOy:0,
    blink:1, breath:0, wake:0,
  }
}

// ─── Canvas face renderer ───
function drawFace(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  f: FaceFrame,
  isDark: boolean,
) {
  // Scale to width, center vertically in the taller panel
  const s = W / 100
  const faceCenterY = 45 * s // visual center of features (brows y=28 to mouth y=62)
  const oy = (H / 2) - faceCenterY // vertical offset to center

  const faceColor = isDark ? '#e5e5e5' : '#1a1a1a'
  const bg = isDark ? '#000000' : '#fafafa'
  const scanColor = isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)'

  // Global opacity (wake sequence) — caller handles clearing
  ctx.globalAlpha = f.wake

  ctx.save()
  // Center vertically
  ctx.translate(0, oy)
  // Head tilt + breathing around face center
  ctx.translate(W / 2, 50 * s)
  ctx.rotate(f.headTilt * Math.PI / 180)
  ctx.translate(-W / 2, -50 * s + Math.sin(f.breath) * 1.2 * s)

  // ── Eyes (rectangles with glow + scanlines) — no head, just floating features ──
  const eyeOx = f.eyeOx * s
  const eyeOy = f.eyeOy * s

  // Left eye
  const leX = (F.leftEyeX + f.leCx) * s + eyeOx
  const leY = F.eyeY * s + eyeOy
  const leW = F.eyeW * f.leSx * s
  const leH = F.eyeH * f.leSy * f.blink * s

  // Right eye
  const reX = (F.rightEyeX + f.reCx) * s + eyeOx
  const reY = F.eyeY * s + eyeOy
  const reW = F.eyeW * f.reSx * s
  const reH = F.eyeH * f.reSy * f.blink * s

  // Minimal eye glow — just enough for a slight halo
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

  // Pupils — dark centers that track cursor with parallax
  ctx.fillStyle = bg
  const drawPupil = (ex: number, ey: number, ew: number, eh: number) => {
    if (eh < 0.5 * s) return // skip when blinking/eyes nearly closed
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

  // ── Brows ── (thick so they register in ASCII)
  ctx.strokeStyle = faceColor
  ctx.lineWidth = Math.max(2, 3.5 * s)
  ctx.lineCap = 'round'

  // Left brow
  ctx.save()
  ctx.translate(F.leftBrowCx * s + eyeOx, (F.browY + f.lbDy) * s + eyeOy)
  ctx.rotate(f.lbR * Math.PI / 180)
  ctx.beginPath()
  ctx.moveTo(-F.browSpan * s, 1.5 * s)
  ctx.quadraticCurveTo(0, -2 * s, F.browSpan * s, 1.5 * s)
  ctx.stroke()
  ctx.restore()

  // Right brow
  ctx.save()
  ctx.translate(F.rightBrowCx * s + eyeOx, (F.browY + f.rbDy) * s + eyeOy)
  ctx.rotate(f.rbR * Math.PI / 180)
  ctx.beginPath()
  ctx.moveTo(-F.browSpan * s, 1.5 * s)
  ctx.quadraticCurveTo(0, -2 * s, F.browSpan * s, 1.5 * s)
  ctx.stroke()
  ctx.restore()

  // ── Nose (L-shape, thin and light to contrast with mouth) ──
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
  ctx.globalAlpha = f.wake // restore after nose's reduced alpha

  // ── Mouth ──
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

  ctx.restore()
  ctx.globalAlpha = 1
}

// ─── ASCII conversion ───
function asciify(
  srcCanvas: HTMLCanvasElement,
  sampleCtx: CanvasRenderingContext2D,
  cols: number, rows: number,
  invert: boolean,
): string {
  sampleCtx.clearRect(0, 0, cols, rows)
  sampleCtx.drawImage(srcCanvas, 0, 0, cols, rows)
  const imgData = sampleCtx.getImageData(0, 0, cols, rows).data

  let str = ''
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (x + y * cols) * 4
      const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2], a = imgData[i + 3]
      if (a === 0) { str += ' '; continue }
      let gray = (0.3 * r + 0.6 * g + 0.1 * b) / 255
      let idx = Math.floor((1 - gray) * (CHARSET.length - 1))
      if (invert) idx = CHARSET.length - idx - 1
      str += CHARSET[idx]
    }
    str += '\n'
  }
  return str
}

// ═══════════════════════════════════════════════
// ─── Component ───
// ═══════════════════════════════════════════════
export function ClawdLoginFace({
  className,
  focusedField,
  isHoveringSubmit = false,
  hasError = false,
  isSubmitting = false,
  transparent = false,
  skipWake = false,
  delayInteractivity = 0,
}: ClawdLoginFaceProps) {
  // ── Refs ──
  const containerRef = useRef<HTMLDivElement>(null)
  const drawCanvasRef = useRef<HTMLCanvasElement>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const animRef = useRef(0)

  // Animated face state (mutated per frame, not React state)
  const faceRef = useRef(createFaceFrame())
  const emotionRef = useRef<LoginFaceEmotion>('neutral')

  // ── React state ──
  const [emotion, setEmotion] = useState<LoginFaceEmotion>('neutral')
  const [isDark, setIsDark] = useState(true)
  const [interactive, setInteractive] = useState(delayInteractivity === 0)
  const interactiveRef = useRef(delayInteractivity === 0)

  // Delay interactivity activation
  useEffect(() => {
    if (delayInteractivity <= 0) { setInteractive(true); interactiveRef.current = true; return }
    const t = setTimeout(() => {
      setInteractive(true)
      interactiveRef.current = true
      // Reset breath so the face starts from zero motion, not mid-cycle
      faceRef.current.breath = 0
    }, delayInteractivity)
    return () => clearTimeout(t)
  }, [delayInteractivity])
  const [gridSize, setGridSize] = useState({ cols: 70, rows: 45, drawW: 280, drawH: 180 })

  // Timer refs
  const ambientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sniffleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wakePhaseRef = useRef(0) // 0=dormant, 1=flicker, 2=opening, 3=blink, 4=awake
  const lastMouseMoveRef = useRef(Date.now())
  const sleepStageRef = useRef(0)
  const isWakingRef = useRef(false)
  const clickCountRef = useRef(0)
  const ambientIndexRef = useRef(0)
  const prevErrorRef = useRef(false)
  const formOverrideRef = useRef(false)
  const targetEyeOffsetRef = useRef({ x: 0, y: 0 })
  const targetHeadTiltRef = useRef(0)
  const isBlinkingRef = useRef(false)
  const snifflePhaseRef = useRef(0) // 0=none, 1-4=sniffle frames
  const passwordFidgetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Dark mode ──
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

  // ── Size calculation ──
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const { width, height } = container.getBoundingClientRect()
      if (width === 0 || height === 0) return
      // Measure actual character width
      const charW = ASCII_FONT_SIZE * 0.6 // monospace approx
      const cols = Math.floor(width / charW)
      const rows = Math.floor(height / ASCII_FONT_SIZE)
      setGridSize({
        cols: Math.min(cols, 80),
        rows: Math.min(rows, 55),
        drawW: Math.min(cols, 80) * 5,
        drawH: Math.min(rows, 55) * 5,
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // ── Emotion setters ──
  const setEmotionDirect = useCallback((e: LoginFaceEmotion) => {
    emotionRef.current = e; setEmotion(e)
  }, [])
  const setEmotionSmooth = useCallback((e: LoginFaceEmotion, delay = 400) => {
    if (e === emotionRef.current) return
    setTimeout(() => { emotionRef.current = e; setEmotion(e) }, delay)
  }, [])

  // ── Wake sequence (storyboard) ──
  // Scene 1 (0-0.8s): blank black
  // Scene 2 (0.8-2.5s): face appears drooped, flickering on
  // Scene 3 (2.5-4s): head pivots up from slumber
  // Scene 4 (4-4.5s): eyes fully open, face upright
  // Scene 5 (4.5-5.5s): double blink
  // Scene 6 (5.5s+): idle
  useEffect(() => {
    if (skipWake) {
      wakePhaseRef.current = 5 // jump straight to idle
      return
    }
    const wp = wakePhaseRef
    const t1 = setTimeout(() => wp.current = 1, 800)
    const t2 = setTimeout(() => wp.current = 2, 3500)
    const t3 = setTimeout(() => wp.current = 3, 6500)
    const t4 = setTimeout(() => wp.current = 4, 7200)
    const t5 = setTimeout(() => wp.current = 5, 8200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5) }
  }, [])

  // ── Blinking ──
  useEffect(() => {
    if (wakePhaseRef.current < 5) {
      const check = setTimeout(() => {}, 4000) // wait for wake
      return () => clearTimeout(check)
    }
    const scheduleBlink = () => {
      blinkTimerRef.current = setTimeout(() => {
        isBlinkingRef.current = true
        setTimeout(() => { isBlinkingRef.current = false; scheduleBlink() }, 150)
      }, 2500 + Math.random() * 4000)
    }
    scheduleBlink()
    return () => { if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current) }
  }, [])

  // Start blinking after wake
  useEffect(() => {
    const t = setTimeout(() => {
      const scheduleBlink = () => {
        blinkTimerRef.current = setTimeout(() => {
          isBlinkingRef.current = true
          setTimeout(() => { isBlinkingRef.current = false; scheduleBlink() }, 150)
        }, 2500 + Math.random() * 4000)
      }
      scheduleBlink()
    }, 4000)
    return () => { clearTimeout(t); if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current) }
  }, [])

  // ── Cursor tracking (perf-optimized, gated by interactive) ──
  useEffect(() => {
    if (!interactive) return
    // Reset targets to zero so tracking ramps from center, not from cursor position
    targetEyeOffsetRef.current = { x: 0, y: 0 }
    targetHeadTiltRef.current = 0
    let raf = 0
    let last = 0
    let cachedRect: DOMRect | null = null
    let rectAge = 0
    // Track how long since interactivity activated — ramp handler influence
    const activatedAt = Date.now()
    const onMove = (ev: MouseEvent) => {
      const now = Date.now()
      if (now - last < 80) return
      last = now
      lastMouseMoveRef.current = now

      // Ramp: how much of the mouse offset to apply (0→1 over 3s)
      const elapsed = (now - activatedAt) / 1000
      const influence = Math.min(1, elapsed / 3)
      if (influence < 0.01) return // ignore mouse entirely at first

      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const container = containerRef.current
        if (!container) return
        if (!cachedRect || now - rectAge > 500) {
          cachedRect = container.getBoundingClientRect()
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
          x: Math.cos(angle) * factor * 3 * influence,
          y: Math.sin(angle) * factor * 2 * influence,
        }
        targetHeadTiltRef.current = (dx / window.innerWidth) * 5 * influence
      })
    }
    document.addEventListener('mousemove', onMove, { passive: true })
    return () => { document.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf) }
  }, [interactive])

  // ── Form-reactive emotions ──
  useEffect(() => {
    if (wakePhaseRef.current < 5) return
    if (isSubmitting) { formOverrideRef.current = true; setEmotionDirect('processing'); return }
    if (hasError && !prevErrorRef.current) {
      formOverrideRef.current = true; setEmotionDirect('concerned')
      const t = setTimeout(() => {
        if (emotionRef.current === 'concerned') {
          setEmotionDirect('relieved')
          setTimeout(() => { formOverrideRef.current = false; setEmotionSmooth('neutral', 800) }, 2000)
        }
      }, 3000)
      return () => clearTimeout(t)
    }
    if (prevErrorRef.current && !hasError) {
      setEmotionDirect('relieved')
      const t = setTimeout(() => { formOverrideRef.current = false; setEmotionSmooth('neutral', 800) }, 1500)
      return () => clearTimeout(t)
    }
    prevErrorRef.current = hasError
    if (isHoveringSubmit) { formOverrideRef.current = true; setEmotionSmooth('excited', 200); return }
    if (focusedField === 'email') {
      formOverrideRef.current = true; setEmotionSmooth('curious', 300)
      targetEyeOffsetRef.current = { x: -2, y: 0 }
      return
    }
    if (focusedField === 'password') {
      formOverrideRef.current = true
      // Dramatically look away — privacy mode
      targetEyeOffsetRef.current = { x: 4, y: -2.5 }
      targetHeadTiltRef.current = 6
      setEmotionDirect('shy')

      // After initial shy, cycle through avoidant fidgeting
      let fidgetStep = 0
      const fidgetEmotions: LoginFaceEmotion[] = ['shy', 'serene', 'zen', 'contemplating', 'serene', 'shy']
      const fidgetOffsets = [
        { x: 4, y: -2.5 },   // looking up-right
        { x: 3, y: -1 },     // drifting
        { x: 5, y: 0 },      // looking hard right
        { x: 3.5, y: -2 },   // looking up
        { x: 4.5, y: -0.5 }, // wandering
        { x: 4, y: -2 },     // back to shy
      ]

      const fidget = () => {
        if (fidgetStep < fidgetEmotions.length) {
          setEmotionDirect(fidgetEmotions[fidgetStep])
          targetEyeOffsetRef.current = fidgetOffsets[fidgetStep]
          fidgetStep = (fidgetStep + 1) % fidgetEmotions.length
          passwordFidgetRef.current = setTimeout(fidget, 3000 + Math.random() * 2000)
        }
      }
      passwordFidgetRef.current = setTimeout(fidget, 2000)
      return () => { if (passwordFidgetRef.current) clearTimeout(passwordFidgetRef.current) }
    }
    // Clean up password fidget when leaving password field
    if (passwordFidgetRef.current && focusedField == null) {
      clearTimeout(passwordFidgetRef.current)
      passwordFidgetRef.current = null
      targetHeadTiltRef.current = 0
    }
    if (formOverrideRef.current && !focusedField && !isHoveringSubmit && !hasError && !isSubmitting) {
      formOverrideRef.current = false
    }
  }, [focusedField, isHoveringSubmit, hasError, isSubmitting, setEmotionDirect, setEmotionSmooth])

  useEffect(() => { prevErrorRef.current = hasError }, [hasError])

  // ── Idle emotion cycling ──
  useEffect(() => {
    const startCycling = () => {
      if (formOverrideRef.current || sleepStageRef.current > 0 || isWakingRef.current) return
      const hour = new Date().getHours()
      const pool = (hour >= 23 || hour < 5) ? AMBIENT_NIGHT : AMBIENT_DAY
      const interval = (hour >= 23 || hour < 5) ? 7000 : 6000
      ambientIndexRef.current = 0
      setEmotionSmooth(pool[0], 500)
      const cycle = () => {
        if (formOverrideRef.current || sleepStageRef.current > 0 || isWakingRef.current) return
        ambientIndexRef.current = (ambientIndexRef.current + 1) % pool.length
        setEmotionDirect(pool[ambientIndexRef.current])
        ambientTimerRef.current = setTimeout(cycle, interval + Math.random() * 2000)
      }
      ambientTimerRef.current = setTimeout(cycle, interval + Math.random() * 1500)
    }
    const t = setTimeout(startCycling, 4500) // after wake
    return () => { clearTimeout(t); if (ambientTimerRef.current) clearTimeout(ambientTimerRef.current) }
  }, [setEmotionSmooth, setEmotionDirect])

  // ── Sleep/wake ──
  useEffect(() => {
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
  }, [setEmotionSmooth, setEmotionDirect])

  // ── Click reactions ──
  const handleClick = useCallback(() => {
    if (wakePhaseRef.current < 5) return
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
  }, [setEmotionDirect, setEmotionSmooth])

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      [ambientTimerRef, blinkTimerRef, sniffleTimerRef, sleepTimerRef, wakeTimerRef, clickTimerRef, clickResetRef, passwordFidgetRef]
        .forEach(r => { if (r.current) clearTimeout(r.current) })
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  // ═══════════════════════════════════════════════
  // ── Main animation loop ──
  // ═══════════════════════════════════════════════
  useEffect(() => {
    const drawCanvas = drawCanvasRef.current
    const sampleCanvas = sampleCanvasRef.current
    if (!drawCanvas || !sampleCanvas) return

    drawCanvas.width = gridSize.drawW
    drawCanvas.height = gridSize.drawH
    sampleCanvas.width = gridSize.cols
    sampleCanvas.height = gridSize.rows

    const drawCtx = drawCanvas.getContext('2d', { willReadFrequently: true })
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })
    if (!drawCtx || !sampleCtx) return
    sampleCtx.imageSmoothingEnabled = false

    let flickerT = 0
    let wakeHeadDroop = -18
    // 3D head pivot: 0 = facing forward, 1 = looking straight down
    // Controls: vertical offset (face drops below center) + vertical compression (foreshortening)
    let wakePivot = 1.0  // starts fully drooped
    let breathAmplitude = 0 // ramps from 0→1 slowly after becoming interactive
    let trackingInfluence = 0 // ramps cursor tracking from 0→1
    const PIVOT_ANCHOR_OFFSET = 18 * (gridSize.drawW / 100) // neck distance — controls how far the face drops

    const animate = () => {
      const face = faceRef.current
      const target = E[emotionRef.current]
      const wp = wakePhaseRef.current
      const t = 0.08 // lerp speed
      const ft = 0.12 // faster lerp for responsive feel

      // ── Interpolate toward target emotion ──
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

      // Eye offset (cursor tracking) — influence ramps in very slowly
      if (interactiveRef.current) {
        trackingInfluence = Math.min(1, trackingInfluence + 0.002) // ~8s to full
      }
      // Use a slower lerp speed that scales with influence — starts near-frozen, gradually responsive
      const trackLerp = ft * trackingInfluence * trackingInfluence // quadratic ramp
      face.eyeOx = lerp(face.eyeOx, targetEyeOffsetRef.current.x * trackingInfluence, trackLerp || 0.001)
      face.eyeOy = lerp(face.eyeOy, targetEyeOffsetRef.current.y * trackingInfluence, trackLerp || 0.001)
      face.headTilt = lerp(face.headTilt, targetHeadTiltRef.current * trackingInfluence, trackLerp || 0.001)

      // Blinking
      const shouldBlink = interactiveRef.current && isBlinkingRef.current
      face.blink = lerp(face.blink, shouldBlink ? 0.08 : 1, shouldBlink ? 0.35 : 0.2)

      // Breathing
      face.breath += 0.025
      // Ramp breathing amplitude slowly when interactive
      if (interactiveRef.current) {
        breathAmplitude = Math.min(1, breathAmplitude + 0.003) // ~5s to reach full
      }

      // Wake sequence — 3D head pivot from looking down to facing forward
      // wakePivot: 1.0 = looking straight down, 0.0 = facing forward
      // Effect: face drops below center (arc path) + compresses vertically (foreshortening)
      if (wp === 0) {
        // Scene 1: blank
        face.wake = 0
        wakePivot = 1.0
      } else if (wp === 1) {
        // Scene 2: face fades in, stays fully drooped
        face.wake = lerp(face.wake, 1, 0.04)
        wakePivot = 1.0 // locked down
      } else if (wp === 2) {
        // Scene 3: head pivots up — ease-in-out speed ramp
        // Starts slow, accelerates through the middle, decelerates at the end
        face.wake = 1
        // Speed ramp: slow start (groggy), builds momentum, eases out
        const dist = wakePivot
        const speed = 0.001 + dist * dist * 0.012
        wakePivot = Math.max(0, wakePivot - speed)
      } else if (wp === 3) {
        // Scene 4: gentle settle with overshoot damping
        face.wake = 1
        wakePivot = lerp(wakePivot, 0.0, 0.08)
      } else if (wp === 4) {
        // Settle into idle
        face.wake = 1
        wakePivot = 0
      } else {
        // Idle
        face.wake = 1
        wakePivot = 0
      }

      // 3D head pivot using arc motion (like a head on a neck)
      // The face is at the front of a sphere (head) that rotates on a neck joint
      // wakePivot: 1.0 = looking straight down, 0.0 = facing forward
      const angle = wakePivot * Math.PI * 0.42 // max ~76 degrees droop
      const foreShorten = Math.cos(angle)       // natural foreshortening from tilt
      const arcDropY = Math.sin(angle) * PIVOT_ANCHOR_OFFSET // arc path: drops then rises

      const W = gridSize.drawW
      const H = gridSize.drawH
      drawCtx.fillStyle = isDark ? '#000000' : '#fafafa'
      drawCtx.fillRect(0, 0, W, H)
      drawCtx.save()

      // 1. Move face down on the arc path
      drawCtx.translate(0, arcDropY)
      // 2. Scale vertically around the face's own center (not the panel top)
      //    drawFace centers the face around H/2 internally, so scale around that
      const faceCenter = H / 2
      drawCtx.translate(0, faceCenter)
      drawCtx.scale(1, foreShorten)
      drawCtx.translate(0, -faceCenter)
      // 3. Draw — scale breathing by amplitude ramp
      const realBreath = face.breath
      face.breath = face.breath * breathAmplitude
      drawFace(drawCtx, W, H, face, isDark)
      face.breath = realBreath // restore for next frame's increment
      drawCtx.restore()

      // ── ASCII conversion ──
      const asciiStr = asciify(drawCanvas, sampleCtx, gridSize.cols, gridSize.rows, true)

      // Add sleep Z's to ASCII string
      let finalStr = asciiStr
      if (emotionRef.current === 'sleeping' && wp >= 4) {
        const lines = finalStr.split('\n')
        const t = Date.now() / 1000
        // Floating z positions
        const zPositions = [
          { x: Math.floor(gridSize.cols * 0.72 + Math.sin(t * 0.5) * 3), y: Math.floor(gridSize.rows * 0.2 + Math.sin(t * 0.3) * 2), ch: 'z' },
          { x: Math.floor(gridSize.cols * 0.76 + Math.sin(t * 0.4 + 1) * 4), y: Math.floor(gridSize.rows * 0.12 + Math.sin(t * 0.35 + 1) * 2), ch: 'Z' },
          { x: Math.floor(gridSize.cols * 0.8 + Math.sin(t * 0.3 + 2) * 3), y: Math.floor(gridSize.rows * 0.06 + Math.sin(t * 0.25 + 2) * 1), ch: 'Z' },
        ]
        for (const z of zPositions) {
          if (z.y >= 0 && z.y < lines.length && z.x >= 0 && z.x < (lines[z.y]?.length ?? 0)) {
            const line = lines[z.y]
            lines[z.y] = line.substring(0, z.x) + z.ch + line.substring(z.x + 1)
          }
        }
        finalStr = lines.join('\n')
      }

      if (preRef.current) {
        preRef.current.textContent = finalStr
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [isDark, gridSize])

  // ═══════════════════════════════════════════════
  // ── Render ──
  // ═══════════════════════════════════════════════
  return (
    <div
      ref={containerRef}
      className={className}
      style={{ overflow: 'hidden', cursor: 'pointer' }}
      onClick={handleClick}
    >
      {/* Font — use system monospace stack for CSP compliance */}

      {/* Background */}
      {!transparent && <div style={{
        position: 'absolute', inset: 0,
        backgroundColor: isDark ? '#000' : '#fafafa',
        transition: 'background-color 0.3s',
      }} />}

      {/* Hidden canvases */}
      <canvas ref={drawCanvasRef} style={{ display: 'none' }} />
      <canvas ref={sampleCanvasRef} style={{ display: 'none' }} />

      {/* ASCII display */}
      <pre
        ref={preRef}
        style={{
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: `${ASCII_FONT_SIZE}px`,
          lineHeight: '1em',
          letterSpacing: '0',
          color: isDark ? '#e5e5e5' : '#1a1a1a',
          textShadow: isDark
            ? '0 0 6px rgba(229,229,229,0.15), 0 0 2px rgba(229,229,229,0.1)'
            : 'none',
          margin: 0,
          padding: 0,
          userSelect: 'none',
          WebkitUserSelect: 'none',
          whiteSpace: 'pre',
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 2,
          // Font rendering isolation — match canvas text rendering
          WebkitFontSmoothing: 'antialiased',
          fontVariant: 'normal',
          fontFeatureSettings: 'normal',
          textRendering: 'geometricPrecision',
          fontStretch: 'normal',
          fontStyle: 'normal',
          textTransform: 'none',
          wordSpacing: '0',
        } as React.CSSProperties}
      />

      {/* Subtle scanline overlay */}
      {!transparent && <div style={{
        position: 'absolute', inset: 0,
        background: isDark
          ? 'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)'
          : 'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.02) 2px, rgba(0,0,0,0.02) 4px)',
        pointerEvents: 'none',
        zIndex: 3,
      }} />}

      {/* Vignette */}
      {!transparent && <div style={{
        position: 'absolute', inset: 0,
        background: isDark
          ? 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)'
          : 'radial-gradient(ellipse at center, transparent 50%, rgba(255,255,255,0.4) 100%)',
        pointerEvents: 'none',
        zIndex: 4,
      }} />}
    </div>
  )
}
