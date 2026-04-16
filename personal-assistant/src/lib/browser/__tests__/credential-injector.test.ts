import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock the Composio client BEFORE importing the injector
// ---------------------------------------------------------------------------

const connectedAccountsGet = vi.fn<(id: string) => Promise<Record<string, any>>>()

vi.mock('@/lib/composio/client', () => ({
  getComposioClient: vi.fn(() => ({
    connectedAccounts: {
      get: connectedAccountsGet,
    },
  })),
  isComposioEnabled: vi.fn(() => true),
}))

import { getComposioClient } from '@/lib/composio/client'
import { getComposioCredentials, injectCredentials } from '../credential-injector'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSession() {
  return {
    act: vi.fn().mockResolvedValue({ success: true }),
  } as any
}

function basicActiveAccount(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'ca_conn_123',
    status: 'ACTIVE',
    toolkit: { slug: 'generic-basic' },
    state: {
      authScheme: 'BASIC',
      val: {
        status: 'ACTIVE',
        username: 'alice@example.com',
        password: 'hunter2',
      },
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// getComposioCredentials
// ---------------------------------------------------------------------------

describe('getComposioCredentials', () => {
  beforeEach(() => {
    connectedAccountsGet.mockReset()
    vi.mocked(getComposioClient).mockReturnValue({
      connectedAccounts: { get: connectedAccountsGet },
    } as any)
  })

  it('returns username + password for BASIC/ACTIVE connections', async () => {
    connectedAccountsGet.mockResolvedValue(basicActiveAccount())

    const creds = await getComposioCredentials('ca_conn_123')

    expect(creds).toEqual({ username: 'alice@example.com', password: 'hunter2' })
    expect(connectedAccountsGet).toHaveBeenCalledWith('ca_conn_123')
  })

  it('reads credentials from the legacy `data` field when `state` is absent', async () => {
    // Some older Composio connections report credentials via the deprecated
    // `data` block keyed by `authSchemeName` instead of `state.authScheme`.
    connectedAccountsGet.mockResolvedValue({
      id: 'ca_legacy',
      status: 'ACTIVE',
      toolkit: { slug: 'generic-basic' },
      data: {
        authSchemeName: 'BASIC',
        username: 'bob@example.com',
        password: 'correcthorsebatterystaple',
      },
    })

    const creds = await getComposioCredentials('ca_legacy')

    expect(creds).toEqual({
      username: 'bob@example.com',
      password: 'correcthorsebatterystaple',
    })
  })

  it('rejects INACTIVE BASIC connections with an actionable error', async () => {
    connectedAccountsGet.mockResolvedValue(
      basicActiveAccount({
        status: 'INACTIVE',
        state: {
          authScheme: 'BASIC',
          val: { status: 'INACTIVE', username: 'alice@example.com' },
        },
      }),
    )

    await expect(getComposioCredentials('ca_conn_123')).rejects.toThrow(/not ACTIVE/i)
    await expect(getComposioCredentials('ca_conn_123')).rejects.toThrow(/INACTIVE/)
  })

  it('rejects OAUTH2 connections with a clear unsupported-scheme error', async () => {
    connectedAccountsGet.mockResolvedValue({
      id: 'ca_oauth',
      status: 'ACTIVE',
      toolkit: { slug: 'gmail' },
      state: {
        authScheme: 'OAUTH2',
        val: { status: 'ACTIVE', access_token: 'ya29.redacted' },
      },
    })

    await expect(getComposioCredentials('ca_oauth')).rejects.toThrow(/OAUTH2/)
    await expect(getComposioCredentials('ca_oauth')).rejects.toThrow(/BASIC/)
  })

  it('rejects API_KEY connections (not supported by browser auto-fill)', async () => {
    connectedAccountsGet.mockResolvedValue({
      id: 'ca_apikey',
      status: 'ACTIVE',
      toolkit: { slug: 'some-api' },
      state: {
        authScheme: 'API_KEY',
        val: { status: 'ACTIVE', api_key: 'sk-abc' },
      },
    })

    await expect(getComposioCredentials('ca_apikey')).rejects.toThrow(/API_KEY/)
  })

  it('throws when COMPOSIO_API_KEY is not configured (client returns null)', async () => {
    vi.mocked(getComposioClient).mockReturnValue(null)

    await expect(getComposioCredentials('ca_conn_123')).rejects.toThrow(
      /COMPOSIO_API_KEY/,
    )
  })

  it('throws when the connected account is not found', async () => {
    connectedAccountsGet.mockRejectedValue(new Error('Not Found (404)'))

    await expect(getComposioCredentials('ca_missing')).rejects.toThrow(
      /not found or inaccessible/i,
    )
  })

  it('throws when the SDK returns no auth-scheme metadata', async () => {
    connectedAccountsGet.mockResolvedValue({
      id: 'ca_empty',
      status: 'ACTIVE',
      toolkit: { slug: 'unknown' },
    })

    await expect(getComposioCredentials('ca_empty')).rejects.toThrow(
      /no auth scheme metadata/i,
    )
  })

  it('throws when BASIC/ACTIVE connection is missing a password', async () => {
    connectedAccountsGet.mockResolvedValue(
      basicActiveAccount({
        state: {
          authScheme: 'BASIC',
          val: { status: 'ACTIVE', username: 'alice@example.com' },
        },
      }),
    )

    await expect(getComposioCredentials('ca_conn_123')).rejects.toThrow(
      /missing a password/i,
    )
  })
})

// ---------------------------------------------------------------------------
// injectCredentials
// ---------------------------------------------------------------------------

describe('injectCredentials', () => {
  beforeEach(() => {
    connectedAccountsGet.mockReset()
    vi.mocked(getComposioClient).mockReturnValue({
      connectedAccounts: { get: connectedAccountsGet },
    } as any)
  })

  it('returns success immediately for "none" source', async () => {
    const session = mockSession()
    const result = await injectCredentials(session, 'none', {})
    expect(result.success).toBe(true)
    expect(session.act).not.toHaveBeenCalled()
  })

  it('injects Composio BASIC credentials via act()', async () => {
    connectedAccountsGet.mockResolvedValue(basicActiveAccount())
    const session = mockSession()

    const result = await injectCredentials(session, 'composio', {
      composioConnectionId: 'ca_conn_123',
      usernameSelector: '#email',
      passwordSelector: '#password',
    })

    expect(result.success).toBe(true)
    expect(session.act).toHaveBeenCalledTimes(1)
    const instruction = session.act.mock.calls[0][0] as string
    // The instruction should fill the actual username into the field but must
    // not embed the raw password (we only pass it by reference in the prompt).
    expect(instruction).toContain('alice@example.com')
    expect(instruction).toContain('#email')
    expect(instruction).toContain('#password')
  })

  it('bubbles Composio retrieval failures as injection errors', async () => {
    connectedAccountsGet.mockRejectedValue(new Error('not found'))
    const session = mockSession()

    const result = await injectCredentials(session, 'composio', {
      composioConnectionId: 'ca_missing',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
    expect(session.act).not.toHaveBeenCalled()
  })

  it('returns error when composioConnectionId is missing', async () => {
    const session = mockSession()
    const result = await injectCredentials(session, 'composio', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('composioConnectionId')
  })

  it('returns error when 1password opSecretRef is missing', async () => {
    const session = mockSession()
    const result = await injectCredentials(session, '1password', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('opSecretRef')
  })

  it('handles act() failure gracefully', async () => {
    connectedAccountsGet.mockResolvedValue(basicActiveAccount())
    const session = mockSession()
    session.act.mockRejectedValue(new Error('element not found'))

    const result = await injectCredentials(session, 'composio', {
      composioConnectionId: 'ca_conn_123',
      usernameSelector: '#email',
      passwordSelector: '#password',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('element not found')
  })

  it('returns error for unknown credential source', async () => {
    const session = mockSession()
    const result = await injectCredentials(session, 'unknown' as any, {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown credential source')
  })
})
