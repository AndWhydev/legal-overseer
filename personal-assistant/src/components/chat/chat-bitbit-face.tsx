'use client'

import { ClawdLoginFace } from '@/components/ui/clawd-login-face'

const FACE_W = 200
const FACE_H = 232

export function ChatBitBitFace() {
  return (
    <div style={{ width: FACE_W, height: FACE_H, position: 'relative' }}>
      <ClawdLoginFace className="absolute inset-0" transparent skipWake />
    </div>
  )
}
