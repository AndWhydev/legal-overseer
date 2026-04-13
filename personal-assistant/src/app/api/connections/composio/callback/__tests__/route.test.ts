import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const dispatchConnectionCrawlMock = vi.fn()
const getAuthContextMock = vi.fn()
const waitForConnectionMock = vi.fn()
const getConnectedAccountMock = vi.fn()
const upsertMock = vi.fn()

vi.mock('@/lib/composio/dispatch-crawl', () => ({
  dispatchConnectionCrawl: dispatchConnectionCrawlMock,
  CRAWL_QUEUE_NAME: 'memory:crawl',
}))

vi.mock('@/lib/supabase/auth-context', () => ({
  getAuthContext: getAuthContextMock,
}))

vi.mock('@/lib/composio', () => ({
  waitForConnection: waitForConnectionMock,
  getConnectedAccount: getConnectedAccountMock,
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
  upsertMock.mockResolvedValue({ error })
  return {
    from: vi.fn().mockReturnValue({
      upsert: upsertMock,
    }),
  }
}

describe('GET /api/connections/composio/callback', () => {
  beforeEach(() => {
    dispatchConnectionCrawlMock.mockReset()
    getAuthContextMock.mockReset()
    waitForConnectionMock.mockReset()
    getConnectedAccountMock.mockReset()
    upsertMock.mockReset()
    dispatchConnectionCrawlMock.mockResolvedValue({ enqueued: true, jobId: 'job-1' })
  })

  it('dispatches the knowledge-librarian crawler after a successful upsert', async () => {
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
    expect(res.headers.get('location')).toContain('/dashboard/connections')
    expect(res.headers.get('location')).toContain('composio_success=true')

    // Allow the fire-and-forget .then/.catch chain to settle
    await Promise.resolve()
    await Promise.resolve()

    expect(dispatchConnectionCrawlMock).toHaveBeenCalledWith({
      orgId: 'org-123',
      appKey: 'gmail',
      connectedAccountId: 'ca_abc',
    })
  })

  it('does NOT dispatch the crawler when the upsert fails', async () => {
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

    await Promise.resolve()
    expect(dispatchConnectionCrawlMock).not.toHaveBeenCalled()
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
    expect(dispatchConnectionCrawlMock).not.toHaveBeenCalled()
  })

  it('does not throw even if the crawler dispatch rejects', async () => {
    const supabase = mockSupabaseReturning(null)
    getAuthContextMock.mockResolvedValue({ orgId: 'org-123', supabase })
    getConnectedAccountMock.mockResolvedValue({
      id: 'ca_abc',
      status: 'ACTIVE',
      toolkit: 'gmail',
    })
    dispatchConnectionCrawlMock.mockRejectedValue(new Error('redis down'))

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
    // flush microtasks so the .catch runs
    await Promise.resolve()
    await Promise.resolve()
  })
})
