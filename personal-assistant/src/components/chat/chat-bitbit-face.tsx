'use client'

import { useRef, useState, useEffect, useCallback, type RefObject } from 'react'
import { ClawdLoginFace } from '@/components/ui/clawd-login-face'
import { BitBitWispIntro } from '@/components/ui/bitbit-wisp-intro'

const FACE_W = 448
const FACE_H = 518
const FONT_SIZE = 14

/**
 * Chat greeting face — plays wisp intro animation first,
 * then reveals the live BitBit face.
 */
// Session-level flag — persists across component mounts/unmounts
let hasPlayedIntro = false

export function ChatBitBitFace() {
  const [wispDone, setWispDone] = useState(hasPlayedIntro)
  const [targetText, setTargetText] = useState<string | null>(null)
  const [textColor, setTextColor] = useState('#e5e5e5')
  const [faceRect, setFaceRect] = useState<{ left: number; top: number } | null>(null)
  const faceContainerRef = useRef<HTMLDivElement>(null)

  // Capture ASCII text AND computed color from the live face
  useEffect(() => {
    let raf: number
    const poll = () => {
      const pre = document.querySelector('[data-bitbit-face-source] pre') as HTMLElement | null
      if (pre && pre.textContent && pre.textContent.trim().length > 10) {
        setTargetText(pre.textContent)
        const computed = getComputedStyle(pre).color
        if (computed) setTextColor(computed)
        // Capture the face container's position for accurate wisp targeting
        if (faceContainerRef.current) {
          const rect = faceContainerRef.current.getBoundingClientRect()
          setFaceRect({ left: rect.left, top: rect.top })
        }
      } else {
        raf = requestAnimationFrame(poll)
      }
    }
    const timer = setTimeout(() => { raf = requestAnimationFrame(poll) }, 300)
    return () => { clearTimeout(timer); cancelAnimationFrame(raf) }
  }, [])

  const [wispFading, setWispFading] = useState(false)

  const handleWispComplete = useCallback(() => {
    hasPlayedIntro = true
    setWispDone(true)
  }, [])

  return (
    <div ref={faceContainerRef} style={{ width: FACE_W, height: FACE_H, position: 'relative' }}>
      {/* Live face — hidden during wisp, shown instantly after */}
      <div
        data-bitbit-face-source
        style={{
          position: 'absolute', inset: 0,
          opacity: wispDone ? 1 : 0,
          pointerEvents: wispDone ? 'auto' : 'none',
        }}
      >
        <ClawdLoginFace className="absolute inset-0" transparent skipWake delayInteractivity={800} />
      </div>

      {/* Wisp canvas — removed instantly when done */}
      {!wispDone && targetText && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
        }}>
          <BitBitWispIntro
            targetText={targetText}
            fontSize={FONT_SIZE}
            width={FACE_W}
            height={FACE_H}
            color={textColor}
            targetRect={faceRect ?? undefined}
            onComplete={handleWispComplete}
          />
        </div>
      )}
    </div>
  )
}
