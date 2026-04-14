import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks (hoisted) ────────────────────────────────────────────────────
const {
  isDevBypassMock,
  authenticateBearerMock,
  createClientMock,
  checkUserEndpointLimitMock,
} = vi.hoisted(() => ({
  isDevBypassMock: vi.fn().mockReturnValue(false),
  authenticateBearerMock: vi.fn().mockResolvedValue(null),
  createClientMock: vi.fn().mockResolvedValue(null),
  checkUserEndpointLimitMock: vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/supabase/server', () => ({
  isDevBypass: isDevBypassMock,
  createClient: createClientMock,
}))

vi.mock('@/lib/supabase/bearer-auth', () => ({
  authenticateBearer: authenticateBearerMock,
}))

vi.mock('@/lib/api-rate-limiter', () => ({
  checkUserEndpointLimit: checkUserEndpointLimitMock,
}))

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

function makeRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/voice/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/voice/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isDevBypassMock.mockReturnValue(true)
    checkUserEndpointLimitMock.mockReturnValue(null)
    // A signing secret must be present for token minting
    process.env.VOICE_SESSION_SECRET = 'test-secret-at-least-32-chars-long-xxxxxx'
    process.env.ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'
  })

  it('mints a token and returns expiresIn with dev bypass', async () => {
    const { POST } = await import('../session/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(typeof json.token).toBe('string')
    expect(json.token.split('.').length).toBe(3)
    expect(json.expiresIn).toBeGreaterThan(0)
    expect(json.voiceId).toBe('21m00Tcm4TlvDq8ikWAM')
  })

  it('returns 401 when not authenticated and dev bypass is off', async () => {
    isDevBypassMock.mockReturnValue(false)
    authenticateBearerMock.mockResolvedValue(null)
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const { POST } = await import('../session/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('uses Bearer token auth when provided', async () => {
    isDevBypassMock.mockReturnValue(false)
    authenticateBearerMock.mockResolvedValue({
      user: { id: 'user-from-bearer', email: 'b@example.com' },
      orgId: 'org-from-bearer',
      displayName: 'Bearer User',
    })

    const { POST } = await import('../session/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
  })

  it('returns 429 when rate limited', async () => {
    const { NextResponse } = await import('next/server')
    checkUserEndpointLimitMock.mockReturnValue(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
    )

    const { POST } = await import('../session/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
  })

  it('returns 503 when no signing secret is available', async () => {
    delete process.env.VOICE_SESSION_SECRET
    delete process.env.NEXTAUTH_SECRET
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const { POST } = await import('../session/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
  })

  it('round-trip: signed token verifies successfully', async () => {
    const { POST } = await import('../session/route')
    const { verifyVoiceSessionToken } = await import('@/lib/voice/session-token')

    const res = await POST(makeRequest({ threadId: 'thread-xyz' }))
    expect(res.status).toBe(200)
    const { token } = await res.json()

    const claims = verifyVoiceSessionToken(token)
    expect(claims).not.toBeNull()
    expect(claims?.thread).toBe('thread-xyz')
    expect(claims?.sub).toBeTruthy()
    expect(claims?.org).toBeTruthy()
  })

  it('rejects tampered tokens', async () => {
    const { POST } = await import('../session/route')
    const { verifyVoiceSessionToken } = await import('@/lib/voice/session-token')
    const res = await POST(makeRequest())
    const { token } = await res.json()

    const [header, payload, sig] = token.split('.')
    // Flip a bit in the signature
    const tampered = `${header}.${payload}.${sig.slice(0, -1)}${sig.slice(-1) === 'a' ? 'b' : 'a'}`
    expect(verifyVoiceSessionToken(tampered)).toBeNull()
  })
})
