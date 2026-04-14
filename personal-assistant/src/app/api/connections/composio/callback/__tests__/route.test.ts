import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getAuthContextMock = vi.fn()
const waitForConnectionMock = vi.fn()
const getConnectedAccountMock = vi.fn()
const getServiceClientMock = vi.fn()
const activateMock = vi.fn()
const createConnectorManagerMock = vi.fn(() => ({ activate: activateMock }))
const upsertMock = vi.fn()

vi.mock('@/lib/supabase/auth-context', () => ({
  getAuthContext: getAuthContextMock,
}))

vi.mock('@/lib/supabase/service-client', () => ({
  getServiceClient: getServiceClientMock,
}))

vi.mock('@/lib/composio', () => ({
  waitForConnection: waitForConnectionMock,
  getConnectedAccount: getConnectedAccountMock,
}))

vi.mock('@/lib/connectors', () => ({
  createConnectorManager: createConnectorManagerMock,
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

function makeRequest(query: Record<string, string>) {
  const params = new URLSearchParams(query)
  return new NextRequest(
    `https://app.bitbit.chat/api/connections/composio/callback?${params.toString()}`,
  )
}

function mockSupabaseReturning(error: { message: string } | null = null) {
  upsertMock.mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: error ? null : { id: 'conn-1', org_id: 'org-123', provider: 'gmail', transport: 'composio' },
        error,
      }),
    }),
  })
  return {
    from: vi.fn().mockReturnValue({
      upsert: upsertMock,
    }),
  }
}

describe('GET /api/connections/composio/callback', () => {
  beforeEach(() => {
    getAuthContextMock.mockReset()
    waitForConnectionMock.mockReset()
    getConnectedAccountMock.mockReset()
    upsertMock.mockReset()
    activateMock.mockReset()
    createConnectorManagerMock.mockClear()
    // Service client is a fallback — return a minimal stub in case cookie auth fails.
    getServiceClientMock.mockReturnValue(mockSupabaseReturning(null))
    activateMock.mockResolvedValue(undefined)
  })

  it('activates the connection via ConnectorManager after a successful upsert', async () => {
    const supabase = mockSupabaseReturning(null)
    getAuthContextMock.mockResolvedValue({ orgId: 'org-123', supabase })
    getConnectedAccountMock.mockResolvedValue({
      id: 'ca_abc',
      status: 'ACTIVE',
      toolkit: 'gmail',
    })

    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        status: 'success',
        connectedAccountId: 'ca_abc',
        appName: 'gmail',
        user_id: 'org-123',
      }),
    )

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('composio_success=true')

    expect(createConnectorManagerMock).toHaveBeenCalled()
    expect(activateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'conn-1', provider: 'gmail', transport: 'composio' }),
      expect.objectContaining({ accountId: 'ca_abc' }),
    )
  })

  it('does NOT activate when the upsert fails', async () => {
    const supabase = mockSupabaseReturning({ message: 'db blew up' })
    getAuthContextMock.mockResolvedValue({ orgId: 'org-123', supabase })
    getConnectedAccountMock.mockResolvedValue({
      id: 'ca_abc',
      status: 'ACTIVE',
      toolkit: 'gmail',
    })

    const { GET } = await import('../route')
    await GET(
      makeRequest({
        status: 'success',
        connectedAccountId: 'ca_abc',
        appName: 'gmail',
        user_id: 'org-123',
      }),
    )

    expect(activateMock).not.toHaveBeenCalled()
  })

  it('redirects to the error landing when status=failed', async () => {
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        status: 'failed',
        appName: 'gmail',
      }),
    )

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('composio_error=auth_failed')
    expect(activateMock).not.toHaveBeenCalled()
  })

  it('does not throw even if activate rejects', async () => {
    const supabase = mockSupabaseReturning(null)
    getAuthContextMock.mockResolvedValue({ orgId: 'org-123', supabase })
    getConnectedAccountMock.mockResolvedValue({
      id: 'ca_abc',
      status: 'ACTIVE',
      toolkit: 'gmail',
    })
    activateMock.mockRejectedValue(new Error('triggers down'))

    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        status: 'success',
        connectedAccountId: 'ca_abc',
        appName: 'gmail',
        user_id: 'org-123',
      }),
    )

    expect(res.status).toBe(307)
  })
})
