import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/agent/tasks', () => ({
  getTaskWithSteps: vi.fn(),
  cancelTask: vi.fn(),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}))

import { createClient } from '@/lib/supabase/server'
import { getTaskWithSteps, cancelTask } from '@/lib/agent/tasks'
import { GET, PATCH } from './route'

const mockCreateClient = vi.mocked(createClient)
const mockGetTaskWithSteps = vi.mocked(getTaskWithSteps)
const mockCancelTask = vi.mocked(cancelTask)

const makeTask = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'task-123',
  org_id: 'org-1',
  thread_id: null,
  task_type: 'standard',
  task_name: 'Test Task',
  status: 'working',
  progress_pct: 50,
  ...overrides,
})

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

function makeRequest(url: string, options?: RequestInit) {
  return new NextRequest(url, options)
}

const makeContext = (taskId: string) => ({
  params: Promise.resolve({ taskId }),
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/agent/tasks/[taskId]', () => {
  it('returns 503 when supabase is not configured', async () => {
    mockCreateClient.mockResolvedValueOnce(null as never)
    const res = await GET(makeRequest('http://localhost/api/agent/tasks/task-123'), makeContext('task-123'))
    expect(res.status).toBe(503)
  })

  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)
    const res = await GET(makeRequest('http://localhost/api/agent/tasks/task-123'), makeContext('task-123'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when task does not exist', async () => {
    const supabase = buildMockSupabase()
    mockCreateClient.mockResolvedValueOnce(supabase as never)
    mockGetTaskWithSteps.mockResolvedValueOnce(null)

    const res = await GET(makeRequest('http://localhost/api/agent/tasks/task-123'), makeContext('task-123'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when task belongs to a different org', async () => {
    const supabase = buildMockSupabase('org-1')
    mockCreateClient.mockResolvedValueOnce(supabase as never)
    mockGetTaskWithSteps.mockResolvedValueOnce({
      task: makeTask({ org_id: 'org-other' }) as never,
      steps: [],
    })

    const res = await GET(makeRequest('http://localhost/api/agent/tasks/task-123'), makeContext('task-123'))
    expect(res.status).toBe(404)
  })

  it('returns task with steps on success', async () => {
    const supabase = buildMockSupabase('org-1')
    mockCreateClient.mockResolvedValueOnce(supabase as never)
    const task = makeTask()
    mockGetTaskWithSteps.mockResolvedValueOnce({ task: task as never, steps: [] })

    const res = await GET(makeRequest('http://localhost/api/agent/tasks/task-123'), makeContext('task-123'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.task.id).toBe('task-123')
    expect(body.steps).toEqual([])
  })
})

describe('PATCH /api/agent/tasks/[taskId]', () => {
  it('returns 400 when action is not "cancel"', async () => {
    const supabase = buildMockSupabase()
    mockCreateClient.mockResolvedValueOnce(supabase as never)

    const res = await PATCH(
      makeRequest('http://localhost/api/agent/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'pause' }),
      }),
      makeContext('task-123'),
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when task does not exist', async () => {
    const supabase = buildMockSupabase()
    mockCreateClient.mockResolvedValueOnce(supabase as never)
    mockGetTaskWithSteps.mockResolvedValueOnce(null)

    const res = await PATCH(
      makeRequest('http://localhost/api/agent/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      }),
      makeContext('task-123'),
    )
    expect(res.status).toBe(404)
  })

  it('cancels task and returns updated task', async () => {
    const supabase = buildMockSupabase('org-1')
    mockCreateClient.mockResolvedValueOnce(supabase as never)
    const task = makeTask()
    mockGetTaskWithSteps.mockResolvedValueOnce({ task: task as never, steps: [] })
    const cancelled = makeTask({ status: 'cancelled' })
    mockCancelTask.mockResolvedValueOnce(cancelled as never)

    const res = await PATCH(
      makeRequest('http://localhost/api/agent/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      }),
      makeContext('task-123'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.task.status).toBe('cancelled')
  })

  it('returns 409 when task is not cancellable', async () => {
    const supabase = buildMockSupabase('org-1')
    mockCreateClient.mockResolvedValueOnce(supabase as never)
    const task = makeTask({ status: 'completed' })
    mockGetTaskWithSteps.mockResolvedValueOnce({ task: task as never, steps: [] })
    mockCancelTask.mockRejectedValueOnce(new Error('TASK_NOT_CANCELLABLE: status is completed'))

    const res = await PATCH(
      makeRequest('http://localhost/api/agent/tasks/task-123', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      }),
      makeContext('task-123'),
    )
    expect(res.status).toBe(409)
  })
})
