/**
 * Tests for /api/delegation GET — list active mandates for the authenticated user's org.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/core/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Stub bearer auth to exercise cookie path.
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
    listActiveMandatesForOrg: vi.fn(),
  }
})

import { createClient } from '@/lib/supabase/server'
import { listActiveMandatesForOrg } from '@/lib/agent/delegation-mandate'
import { GET } from './route'

const mockedCreateClient = vi.mocked(createClient)
const mockedListActiveMandates = vi.mocked(listActiveMandatesForOrg)

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

describe('GET /api/delegation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no authenticated user', async () => {
    setAuth(null, null)
    const request = new NextRequest('http://localhost/api/delegation')
    const res = await GET(request)
    expect(res!.status).toBe(401)
    const body = await res!.json()
    expect(body.error).toMatch(/unauthor/i)
  })

  it('returns 400 when authenticated user has no profile/org', async () => {
    setAuth('user-1', null)
    const request = new NextRequest('http://localhost/api/delegation')
    const res = await GET(request)
    expect(res!.status).toBe(400)
    const body = await res!.json()
    expect(body.error).toMatch(/profile|no org/i)
  })

  it('returns the active mandates scoped to the user org', async () => {
    setAuth('user-1', 'org-1')
    mockedListActiveMandates.mockResolvedValue([
      {
        id: 'm-1',
        entityId: 'e-1',
        entityName: 'Acme Corp',
        mandateLevel: 'infinite_autopilot',
        activatedAt: '2026-04-14T00:00:00Z',
        activatedVia: 'whatsapp',
      },
    ])
    const request = new NextRequest('http://localhost/api/delegation')
    const res = await GET(request)
    expect(res!.status).toBe(200)
    const body = await res!.json()
    expect(body.mandates).toHaveLength(1)
    expect(body.mandates[0].entityName).toBe('Acme Corp')
    expect(mockedListActiveMandates).toHaveBeenCalledWith(expect.anything(), 'org-1')
  })

  it('returns empty array when no mandates', async () => {
    setAuth('user-1', 'org-1')
    mockedListActiveMandates.mockResolvedValue([])
    const request = new NextRequest('http://localhost/api/delegation')
    const res = await GET(request)
    expect(res!.status).toBe(200)
    const body = await res!.json()
    expect(body.mandates).toEqual([])
  })
})
