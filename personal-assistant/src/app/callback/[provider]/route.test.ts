import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cookiesMock,
  createClientMock,
  exchangeOAuthCodeMock,
  validateOAuthStateMock,
  storeOrgCredentialMock,
  getActiveOrgIdMock,
  loggerErrorMock,
  channelConnectionsUpsertMock,
  channelConnectionsMaybeSingleMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  createClientMock: vi.fn(),
  exchangeOAuthCodeMock: vi.fn(),
  validateOAuthStateMock: vi.fn(),
  storeOrgCredentialMock: vi.fn(),
  getActiveOrgIdMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  channelConnectionsUpsertMock: vi.fn(),
  channelConnectionsMaybeSingleMock: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/integrations/oauth', () => ({
  exchangeOAuthCode: exchangeOAuthCodeMock,
  validateOAuthState: validateOAuthStateMock,
  OAUTH_STATE_COOKIE: 'bb-oauth-state',
  OAUTH_VERIFIER_COOKIE: 'bb-oauth-verifier',
}))

vi.mock('@/lib/integrations/credentials', () => ({
  storeOrgCredential: storeOrgCredentialMock,
}))

vi.mock('@/lib/tenancy', () => ({
  getActiveOrgId: getActiveOrgIdMock,
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    error: loggerErrorMock,
  },
}))

describe('/callback/[provider] GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OUTLOOK_TENANT_ID = 'tenant-from-env'

    cookiesMock.mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === 'bb-oauth-state') return { value: 'expected-state' }
        if (name === 'bb-oauth-verifier') return { value: 'pkce-verifier' }
        return undefined
      }),
    })

    validateOAuthStateMock.mockReturnValue(true)
    exchangeOAuthCodeMock.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    })
    storeOrgCredentialMock.mockResolvedValue(undefined)
    getActiveOrgIdMock.mockResolvedValue('org-123')
    channelConnectionsUpsertMock.mockResolvedValue({ error: null })
    channelConnectionsMaybeSingleMock.mockResolvedValue({ data: null, error: null })

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
            },
          },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'channel_connections') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: channelConnectionsMaybeSingleMock,
                })),
              })),
            })),
            upsert: channelConnectionsUpsertMock,
          }
        }

        return {
          upsert: channelConnectionsUpsertMock,
        }
      }),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.OUTLOOK_TENANT_ID
  })

  it('redirects OAuth errors to the canonical connections route', async () => {
    const { GET } = await import('./route')

    const response = await GET(
      new Request('https://app.bitbit.test/callback/gmail?error=access_denied&error_description=User%20cancelled'),
      { params: Promise.resolve({ provider: 'gmail' }) },
    )

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '')).toMatchObject({
      pathname: '/dashboard/connections',
      search: '?error=User%20cancelled',
    })
  })

  it('redirects successful OAuth connections to the canonical connections route', async () => {
    const { GET } = await import('./route')

    const response = await GET(
      new Request('https://app.bitbit.test/callback/gmail?code=oauth-code&state=expected-state'),
      { params: Promise.resolve({ provider: 'gmail' }) },
    )

    expect(validateOAuthStateMock).toHaveBeenCalledWith('expected-state', 'expected-state')
    expect(exchangeOAuthCodeMock).toHaveBeenCalledWith(
      'gmail',
      'oauth-code',
      'pkce-verifier',
      'https://app.bitbit.test',
    )
    expect(storeOrgCredentialMock).toHaveBeenCalled()
    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '')).toMatchObject({
      pathname: '/dashboard/connections',
      search: '?connected=gmail',
    })
  })

  it('stores outlook tenant metadata alongside OAuth tokens', async () => {
    const { GET } = await import('./route')

    await GET(
      new Request('https://app.bitbit.test/callback/outlook?code=oauth-code&state=expected-state'),
      { params: Promise.resolve({ provider: 'outlook' }) },
    )

    expect(storeOrgCredentialMock).toHaveBeenCalledWith(
      expect.anything(),
      'org-123',
      'outlook',
      expect.objectContaining({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        tenant_id: 'tenant-from-env',
      }),
      'user-123',
    )
  })

  it('maps google-calendar into the legacy calendar channel connection slot', async () => {
    const { GET } = await import('./route')

    await GET(
      new Request('https://app.bitbit.test/callback/google-calendar?code=oauth-code&state=expected-state'),
      { params: Promise.resolve({ provider: 'google-calendar' }) },
    )

    expect(channelConnectionsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_type: 'calendar',
      }),
      { onConflict: 'org_id,channel_type' },
    )
  })
})
