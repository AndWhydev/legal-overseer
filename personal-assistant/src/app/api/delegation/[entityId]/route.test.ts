/**
 * Tests for /api/delegation/[entityId] DELETE — revoke mandate for a specific entity.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/core/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/supabase/bearer-auth', () => ({
  authenticateBearer: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/supabase/service-client', () => ({
  getServiceClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/agent/delegation-mandate', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agent/delegation-mandate')>(
    '@/lib/agent/delegation-mandate',
  )
  return {
    ...actual,
    revokeEntityMandate: vi.fn(),
  }
})

import { createClient } from '@/lib/supabase/server'
import { revokeEntityMandate } from '@/lib/agent/delegation-mandate'
import { DELETE } from './route'

const mockedCreateClient = vi.mocked(createClient)
const mockedRevoke = vi.mocked(revokeEntityMandate)

function setAuth(userId: string | null, orgId: string | null) {
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: orgId ? { org_id: orgId } : null,
            error: null,
          }),
        }),
      }),
    }),
  } as any)
}

describe('DELETE /api/delegation/[entityId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    setAuth(null, null)
    const request = new NextRequest('http://localhost/api/delegation/e-1', { method: 'DELETE' })
    const res = await DELETE(request, { params: Promise.resolve({ entityId: 'e-1' }) })
    expect(res!.status).toBe(401)
  })

  it('revokes and returns { revoked: true } when mandate exists', async () => {
    setAuth('user-1', 'org-1')
    mockedRevoke.mockResolvedValue(true)
    const request = new NextRequest('http://localhost/api/delegation/e-1', { method: 'DELETE' })
    const res = await DELETE(request, { params: Promise.resolve({ entityId: 'e-1' }) })
    expect(res!.status).toBe(200)
    const body = await res!.json()
    expect(body.revoked).toBe(true)
    expect(mockedRevoke).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'e-1',
      'dashboard',
    )
  })

  it('returns 200 with revoked=false when no active mandate', async () => {
    setAuth('user-1', 'org-1')
    mockedRevoke.mockResolvedValue(false)
    const request = new NextRequest('http://localhost/api/delegation/e-1', { method: 'DELETE' })
    const res = await DELETE(request, { params: Promise.resolve({ entityId: 'e-1' }) })
    expect(res!.status).toBe(200)
    const body = await res!.json()
    expect(body.revoked).toBe(false)
  })

  it('returns 400 when entityId is missing', async () => {
    setAuth('user-1', 'org-1')
    const request = new NextRequest('http://localhost/api/delegation/', { method: 'DELETE' })
    const res = await DELETE(request, { params: Promise.resolve({ entityId: '' }) })
    expect(res!.status).toBe(400)
  })
})
