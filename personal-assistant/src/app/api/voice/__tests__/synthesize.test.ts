import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks (hoisted) ────────────────────────────────────────────────────
const {
  isDevBypassMock,
  authenticateBearerMock,
  createClientMock,
  checkUserEndpointLimitMock,
  fetchMock,
} = vi.hoisted(() => ({
  isDevBypassMock: vi.fn().mockReturnValue(false),
  authenticateBearerMock: vi.fn().mockResolvedValue(null),
  createClientMock: vi.fn().mockResolvedValue(null),
  checkUserEndpointLimitMock: vi.fn().mockReturnValue(null),
  fetchMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  isDevBypass: isDevBypassMock,
  createClient: createClientMock,
}))

vi.mock('@/lib/supabase/service-client', () => ({
  getServiceClient: vi.fn().mockReturnValue({}),
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

// Replace global fetch for OpenAI API calls
vi.stubGlobal('fetch', fetchMock)

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/voice/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Tests ───────────────────────────────────────────────────────────────
describe('POST /api/voice/synthesize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: dev bypass enabled so auth doesn't block validation tests
    isDevBypassMock.mockReturnValue(true)
    process.env.OPENAI_API_KEY = 'test-key'
  })

  // ── Validation ──────────────────────────────────────────────────────

  it('returns 400 when text is missing', async () => {
    const { POST } = await import('../synthesize/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/text.*required/i)
  })

  it('returns 400 when text exceeds 4096 characters', async () => {
    const { POST } = await import('../synthesize/route')
    const res = await POST(makeRequest({ text: 'a'.repeat(4097) }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/too long/i)
  })

  it('returns 400 when voice is invalid', async () => {
    const { POST } = await import('../synthesize/route')
    const res = await POST(makeRequest({ text: 'Hello', voice: 'invalid-voice' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/voice/i)
  })

  it('accepts all valid voice options', async () => {
    const voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
    const { POST } = await import('../synthesize/route')

    for (const voice of voices) {
      fetchMock.mockResolvedValueOnce(
        new Response(new Uint8Array([0xff, 0xfb]), {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        }),
      )
      const res = await POST(makeRequest({ text: 'Hello', voice }))
      expect(res.status).not.toBe(400)
    }
  })

  // ── Authentication ──────────────────────────────────────────────────

  it('returns 401 when not authenticated and dev bypass is off', async () => {
    isDevBypassMock.mockReturnValue(false)
    authenticateBearerMock.mockResolvedValue(null)
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const { POST } = await import('../synthesize/route')
    const res = await POST(makeRequest({ text: 'Hello' }))
    expect(res.status).toBe(401)
  })

  it('allows request with dev bypass enabled', async () => {
    isDevBypassMock.mockReturnValue(true)
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([0xff, 0xfb]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    )

    const { POST } = await import('../synthesize/route')
    const res = await POST(makeRequest({ text: 'Hello' }))
    expect(res.status).toBe(200)
  })

  // ── Rate limiting ───────────────────────────────────────────────────

  it('returns 429 when rate limited', async () => {
    const { NextResponse } = await import('next/server')
    checkUserEndpointLimitMock.mockReturnValue(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
    )

    const { POST } = await import('../synthesize/route')
    const res = await POST(makeRequest({ text: 'Hello' }))
    expect(res.status).toBe(429)
  })

  // ── OpenAI key missing ─────────────────────────────────────────────

  it('returns 503 when OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY

    const { POST } = await import('../synthesize/route')
    const res = await POST(makeRequest({ text: 'Hello' }))
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toMatch(/not configured/i)
  })
})
