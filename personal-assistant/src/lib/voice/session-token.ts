/**
 * Voice session token — HS256 JWT minted by `/api/voice/session` and verified
 * by `/api/voice/stream`.
 *
 * No external dependency. The transport token is intentionally short-lived
 * (5 min) so a stolen token has limited blast radius.
 */

import { createHmac, randomBytes } from 'crypto'

export const SESSION_TTL_SECONDS = 5 * 60

export interface VoiceSessionClaims {
  sub: string // userId
  org: string // orgId
  email?: string
  name?: string
  thread?: string
  iat: number
  exp: number
  jti: string
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64urlDecode(input: string): Buffer {
  const pad = 4 - (input.length % 4)
  const padded = pad < 4 ? input + '='.repeat(pad) : input
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function getSigningSecret(): string {
  const secret =
    process.env.VOICE_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('No signing secret available (set VOICE_SESSION_SECRET)')
  }
  return secret
}

export function signVoiceSessionToken(
  claims: Omit<VoiceSessionClaims, 'iat' | 'exp' | 'jti'>,
): string {
  const now = Math.floor(Date.now() / 1000)
  const fullClaims: VoiceSessionClaims = {
    ...claims,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    jti: randomBytes(8).toString('hex'),
  }
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify(fullClaims))
  const toSign = `${header}.${payload}`
  const sig = base64url(createHmac('sha256', getSigningSecret()).update(toSign).digest())
  return `${toSign}.${sig}`
}

export function verifyVoiceSessionToken(token: string): VoiceSessionClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  const expectedSig = base64url(
    createHmac('sha256', getSigningSecret()).update(`${header}.${payload}`).digest(),
  )
  // Constant-time compare
  if (sig.length !== expectedSig.length) return null
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i)
  if (diff !== 0) return null

  let claims: VoiceSessionClaims
  try {
    claims = JSON.parse(base64urlDecode(payload).toString('utf8')) as VoiceSessionClaims
  } catch {
    return null
  }

  // Validate required claims are present and well-typed
  if (
    typeof claims.sub !== 'string' || !claims.sub ||
    typeof claims.org !== 'string' || !claims.org ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number' ||
    typeof claims.jti !== 'string' || !claims.jti
  ) {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  if (claims.exp < now) return null
  return claims
}
