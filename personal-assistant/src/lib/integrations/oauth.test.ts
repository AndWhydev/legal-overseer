import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalEnv = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  OUTLOOK_CLIENT_ID: process.env.OUTLOOK_CLIENT_ID,
  OUTLOOK_CLIENT_SECRET: process.env.OUTLOOK_CLIENT_SECRET,
  ASANA_CLIENT_ID: process.env.ASANA_CLIENT_ID,
  ASANA_CLIENT_SECRET: process.env.ASANA_CLIENT_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
}

describe('OAuth redirect handling', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.GOOGLE_CLIENT_ID = 'google-client'
    process.env.GOOGLE_CLIENT_SECRET = 'google-secret'
    process.env.OUTLOOK_CLIENT_ID = 'outlook-client'
    process.env.OUTLOOK_CLIENT_SECRET = 'outlook-secret'
    process.env.ASANA_CLIENT_ID = 'asana-client'
    process.env.ASANA_CLIENT_SECRET = 'asana-secret'
    process.env.NEXT_PUBLIC_APP_URL = 'http://studio-server:3000'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.assign(process.env, originalEnv)
  })

  it('builds OAuth start URLs from the runtime origin when provided', async () => {
    const { getOAuthRedirectUrl } = await import('./oauth')

    const { url } = getOAuthRedirectUrl('gmail', 'http://localhost:3000')
    const parsed = new URL(url)

    expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:3000/callback/gmail')
  })

  it('requests Asana using the default scope only', async () => {
    const { getOAuthRedirectUrl } = await import('./oauth')

    const { url } = getOAuthRedirectUrl('asana', 'http://localhost:3000')
    const parsed = new URL(url)

    expect(parsed.searchParams.get('scope')).toBe('default')
  })

  it('uses the same runtime redirect URI when exchanging an OAuth code', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'token', refresh_token: 'refresh', expires_in: 3600 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { exchangeOAuthCode } = await import('./oauth')

    await exchangeOAuthCode('outlook', 'oauth-code', 'pkce-verifier', 'http://localhost:3000')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = String(init.body)

    expect(body).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback%2Foutlook')
  })
})
