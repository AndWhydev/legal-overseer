import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/agent/tasks', () => ({
  getActiveTasks: vi.fn(),
  listTasks: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getActiveTasks, listTasks } from '@/lib/agent/tasks'
import { GET } from './route'

const mockCreateClient = vi.mocked(createClient)
const mockGetActiveTasks = vi.mocked(getActiveTasks)
const mockListTasks = vi.mocked(listTasks)

function buildMockSupabase(orgId = 'org-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { org_id: orgId }, error: null }),
    }),
  }
}

function makeRequest(url: string) {
  return new NextRequest(url)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/agent/tasks', () => {
  it('returns 503 when supabase is not configured', async () => {
    mockCreateClient.mockResolvedValueOnce(null as never)
    const res = await GET(makeRequest('http://localhost/api/agent/tasks'))
    expect(res!.status).toBe(503)
  })

  it('returns 401 when user is not authenticated', async () => {
    mockCreateClient.mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)
    const res = await GET(makeRequest('http://localhost/api/agent/tasks'))
    expect(res!.status).toBe(401)
  })

  it('returns 400 when profile has no org_id', async () => {
    mockCreateClient.mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    } as never)
    const res = await GET(makeRequest('http://localhost/api/agent/tasks'))
    expect(res!.status).toBe(400)
  })

  it('calls getActiveTasks when active=true query param is set', async () => {
    const supabase = buildMockSupabase()
    mockCreateClient.mockResolvedValueOnce(supabase as never)
    mockGetActiveTasks.mockResolvedValueOnce([])

    const res = await GET(makeRequest('http://localhost/api/agent/tasks?active=true'))
    expect(res!.status).toBe(200)
    expect(mockGetActiveTasks).toHaveBeenCalledWith(supabase, 'org-1')
    const body = await res!.json()
    expect(body).toEqual({ tasks: [] })
  })

  it('calls listTasks with status filter', async () => {
    const supabase = buildMockSupabase()
    mockCreateClient.mockResolvedValueOnce(supabase as never)
    mockListTasks.mockResolvedValueOnce([])

    const res = await GET(makeRequest('http://localhost/api/agent/tasks?status=working'))
    expect(res!.status).toBe(200)
    expect(mockListTasks).toHaveBeenCalledWith(supabase, 'org-1', { status: 'working', task_type: undefined })
  })

  it('queries by thread_id directly when thread_id param is set', async () => {
    const queryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1' }, error: null }),
          }
        }
        return queryChain
      }),
    }
    mockCreateClient.mockResolvedValueOnce(supabase as never)

    const res = await GET(makeRequest('http://localhost/api/agent/tasks?thread_id=thread-abc'))
    expect(res!.status).toBe(200)
    const body = await res!.json()
    expect(body).toEqual({ tasks: [] })
  })

  it('returns 500 on unexpected error from listTasks', async () => {
    const supabase = buildMockSupabase()
    mockCreateClient.mockResolvedValueOnce(supabase as never)
    mockListTasks.mockRejectedValueOnce(new Error('DB error'))

    const res = await GET(makeRequest('http://localhost/api/agent/tasks'))
    expect(res!.status).toBe(500)
    const body = await res!.json()
    expect(body.error).toBe('DB error')
  })
})
