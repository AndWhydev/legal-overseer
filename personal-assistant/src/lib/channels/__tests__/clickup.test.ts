import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fetchClickUpSpaces,
  fetchClickUpLists,
  fetchClickUpTasks,
  createClickUpTask,
  updateClickUpTask,
  handleClickUpWebhook,
  clickupAdapter,
} from '../clickup'

vi.mock('@/lib/integrations/credentials', () => ({
  getOrgCredential: vi.fn(),
}))

import { getOrgCredential } from '@/lib/integrations/credentials'
const mockGetCreds = vi.mocked(getOrgCredential)

afterEach(() => vi.restoreAllMocks())

const MOCK_CREDS = { access_token: 'pk_test_clickup_token' }

// ---------------------------------------------------------------------------
// fetchClickUpSpaces
// ---------------------------------------------------------------------------
describe('ClickUp Integration', () => {
  describe('fetchClickUpSpaces', () => {
    it('returns error when no credentials', async () => {
      mockGetCreds.mockResolvedValue(null)
      const result = await fetchClickUpSpaces({} as any, 'org-1', 'team-1')
      expect(result).toHaveProperty('error')
      expect((result as any).error).toContain('No ClickUp credentials')
    })

    it('fetches spaces from ClickUp API', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          spaces: [
            { id: 'space-1', name: 'Engineering' },
            { id: 'space-2', name: 'Marketing' },
          ],
        }),
      }))

      const result = await fetchClickUpSpaces({} as any, 'org-1', 'team-1')
      expect(Array.isArray(result)).toBe(true)
      expect((result as any[]).length).toBe(2)
      expect((result as any[])[0].name).toBe('Engineering')
    })

    it('sends correct Authorization header', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      let capturedHeaders: Record<string, string> = {}
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>
        return Promise.resolve({
          ok: true,
          json: async () => ({ spaces: [] }),
        })
      }))

      await fetchClickUpSpaces({} as any, 'org-1', 'team-1')
      expect(capturedHeaders.Authorization).toBe('pk_test_clickup_token')
    })

    it('handles API errors gracefully', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      }))

      const result = await fetchClickUpSpaces({} as any, 'org-1', 'team-1')
      expect(result).toHaveProperty('error')
      expect((result as any).details).toContain('429')
    })

    it('handles network failure', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

      const result = await fetchClickUpSpaces({} as any, 'org-1', 'team-1')
      expect(result).toHaveProperty('error')
      expect((result as any).error).toContain('Failed to fetch spaces')
    })
  })

  // -------------------------------------------------------------------------
  // fetchClickUpLists
  // -------------------------------------------------------------------------
  describe('fetchClickUpLists', () => {
    it('returns error when no credentials', async () => {
      mockGetCreds.mockResolvedValue(null)
      const result = await fetchClickUpLists({} as any, 'org-1', 'space-1')
      expect(result).toHaveProperty('error')
    })

    it('fetches lists from a space', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lists: [
            { id: 'list-1', name: 'Backlog', space: { id: 'space-1' } },
            { id: 'list-2', name: 'Sprint', space: { id: 'space-1' } },
          ],
        }),
      }))

      const result = await fetchClickUpLists({} as any, 'org-1', 'space-1')
      expect(Array.isArray(result)).toBe(true)
      expect((result as any[]).length).toBe(2)
    })

    it('calls correct API path with spaceId', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      let capturedUrl = ''
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({
          ok: true,
          json: async () => ({ lists: [] }),
        })
      }))

      await fetchClickUpLists({} as any, 'org-1', 'space-42')
      expect(capturedUrl).toContain('/space/space-42/list')
    })
  })

  // -------------------------------------------------------------------------
  // fetchClickUpTasks
  // -------------------------------------------------------------------------
  describe('fetchClickUpTasks', () => {
    it('returns error when no credentials', async () => {
      mockGetCreds.mockResolvedValue(null)
      const result = await fetchClickUpTasks({} as any, 'org-1', { listId: 'list-1' })
      expect(result).toHaveProperty('error')
    })

    it('returns error when listId is missing', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      const result = await fetchClickUpTasks({} as any, 'org-1', {})
      expect(result).toHaveProperty('error')
      expect((result as any).error).toContain('listId is required')
    })

    it('fetches tasks from a list', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tasks: [
            {
              id: 'task-1',
              name: 'Fix login bug',
              status: { name: 'in progress', color: '#ffa500' },
              assignees: [{ id: 'u1', username: 'alice' }],
              list: { id: 'list-1', name: 'Sprint' },
              space: { id: 'space-1' },
              priority: { id: '1', priority: 'high' },
            },
          ],
        }),
      }))

      const result = await fetchClickUpTasks({} as any, 'org-1', { listId: 'list-1' })
      expect(Array.isArray(result)).toBe(true)
      expect((result as any[])[0].name).toBe('Fix login bug')
    })

    it('passes include_closed and page params', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      let capturedUrl = ''
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({
          ok: true,
          json: async () => ({ tasks: [] }),
        })
      }))

      await fetchClickUpTasks({} as any, 'org-1', { listId: 'list-1', includeClosed: true, page: 2 })
      expect(capturedUrl).toContain('include_closed=true')
      expect(capturedUrl).toContain('page=2')
    })

    it('handles 401 unauthorized response', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Token expired',
      }))

      const result = await fetchClickUpTasks({} as any, 'org-1', { listId: 'list-1' })
      expect(result).toHaveProperty('error')
      expect((result as any).details).toContain('401')
    })
  })

  // -------------------------------------------------------------------------
  // createClickUpTask
  // -------------------------------------------------------------------------
  describe('createClickUpTask', () => {
    it('creates a task successfully', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'task-new',
          name: 'New Feature',
          status: { name: 'to do', color: '#808080' },
          assignees: [],
          list: { id: 'list-1', name: 'Sprint' },
          space: { id: 'space-1' },
        }),
      }))

      const result = await createClickUpTask({} as any, 'org-1', 'list-1', {
        name: 'New Feature',
        description: 'Build the new feature',
        priority: 2,
      })

      expect((result as any).id).toBe('task-new')
      expect((result as any).name).toBe('New Feature')
    })

    it('returns error when no credentials', async () => {
      mockGetCreds.mockResolvedValue(null)
      const result = await createClickUpTask({} as any, 'org-1', 'list-1', { name: 'Test' })
      expect(result).toHaveProperty('error')
    })

    it('sends correct request body', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      let capturedBody = ''
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBody = init.body as string
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'task-1', name: 'Test', status: { name: 'to do', color: '#808080' }, assignees: [], list: { id: 'list-1', name: 'Sprint' }, space: { id: 'space-1' } }),
        })
      }))

      await createClickUpTask({} as any, 'org-1', 'list-1', {
        name: 'Build API',
        assignees: ['user-1'],
        tags: ['backend'],
      })

      const body = JSON.parse(capturedBody)
      expect(body.name).toBe('Build API')
      expect(body.assignees).toEqual(['user-1'])
      expect(body.tags).toEqual(['backend'])
    })

    it('handles API error on create', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid list_id',
      }))

      const result = await createClickUpTask({} as any, 'org-1', 'invalid-list', { name: 'Test' })
      expect(result).toHaveProperty('error')
    })
  })

  // -------------------------------------------------------------------------
  // updateClickUpTask
  // -------------------------------------------------------------------------
  describe('updateClickUpTask', () => {
    it('updates a task successfully', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'task-1',
          name: 'Updated Task',
          status: { name: 'complete', color: '#00ff00' },
          assignees: [],
          list: { id: 'list-1', name: 'Sprint' },
          space: { id: 'space-1' },
        }),
      }))

      const result = await updateClickUpTask({} as any, 'org-1', 'task-1', {
        status: 'complete',
      })

      expect((result as any).status.name).toBe('complete')
    })

    it('calls correct API path with task ID', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      let capturedUrl = ''
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'task-99', name: 'X', status: { name: 'open', color: '#fff' }, assignees: [], list: { id: 'l', name: 'L' }, space: { id: 's' } }),
        })
      }))

      await updateClickUpTask({} as any, 'org-1', 'task-99', { name: 'Renamed' })
      expect(capturedUrl).toContain('/task/task-99')
    })

    it('uses PUT method', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      let capturedMethod = ''
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedMethod = init.method as string
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 't', name: 'T', status: { name: 'x', color: '#000' }, assignees: [], list: { id: 'l', name: 'L' }, space: { id: 's' } }),
        })
      }))

      await updateClickUpTask({} as any, 'org-1', 'task-1', { status: 'done' })
      expect(capturedMethod).toBe('PUT')
    })
  })

  // -------------------------------------------------------------------------
  // handleClickUpWebhook
  // -------------------------------------------------------------------------
  describe('handleClickUpWebhook', () => {
    it('parses valid webhook payload', () => {
      const result = handleClickUpWebhook({
        event: 'taskUpdated',
        task_id: 'task-1',
        webhook_id: 'wh-1',
        history_items: [
          { id: 'h1', field: 'status', before: 'open', after: 'closed' },
        ],
      })

      expect((result as any).event).toBe('taskUpdated')
      expect((result as any).task_id).toBe('task-1')
      expect((result as any).history_items).toHaveLength(1)
    })

    it('returns error for null payload', () => {
      const result = handleClickUpWebhook(null)
      expect(result).toHaveProperty('error')
      expect((result as any).error).toContain('Invalid webhook payload')
    })

    it('returns error for undefined payload', () => {
      const result = handleClickUpWebhook(undefined)
      expect(result).toHaveProperty('error')
    })

    it('returns error for missing event field', () => {
      const result = handleClickUpWebhook({ task_id: 'task-1' })
      expect(result).toHaveProperty('error')
      expect((result as any).error).toContain('missing event')
    })

    it('handles webhook with minimal fields', () => {
      const result = handleClickUpWebhook({ event: 'taskCreated' })
      expect((result as any).event).toBe('taskCreated')
      expect((result as any).task_id).toBeUndefined()
      expect((result as any).history_items).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // clickupAdapter
  // -------------------------------------------------------------------------
  describe('clickupAdapter', () => {
    it('has correct metadata', () => {
      expect(clickupAdapter.type).toBe('clickup')
      expect(clickupAdapter.name).toBe('ClickUp')
      expect(clickupAdapter.icon).toBe('ListTodo')
    })

    it('pull returns empty array when no token', async () => {
      const origToken = process.env.CLICKUP_ACCESS_TOKEN
      const origPat = process.env.CLICKUP_PAT
      delete process.env.CLICKUP_ACCESS_TOKEN
      delete process.env.CLICKUP_PAT

      try {
        const result = await clickupAdapter.pull({}, new Date())
        expect(result).toEqual([])
      } finally {
        if (origToken) process.env.CLICKUP_ACCESS_TOKEN = origToken
        if (origPat) process.env.CLICKUP_PAT = origPat
      }
    })

    it('pull returns empty array when no listId', async () => {
      const origToken = process.env.CLICKUP_ACCESS_TOKEN
      process.env.CLICKUP_ACCESS_TOKEN = 'test-token'
      const origListId = process.env.CLICKUP_LIST_ID
      delete process.env.CLICKUP_LIST_ID

      try {
        const result = await clickupAdapter.pull({}, new Date())
        expect(result).toEqual([])
      } finally {
        if (origToken) process.env.CLICKUP_ACCESS_TOKEN = origToken
        else delete process.env.CLICKUP_ACCESS_TOKEN
        if (origListId) process.env.CLICKUP_LIST_ID = origListId
      }
    })

    it('pull maps ClickUp tasks to ChannelMessages', async () => {
      const origToken = process.env.CLICKUP_ACCESS_TOKEN
      const origListId = process.env.CLICKUP_LIST_ID
      process.env.CLICKUP_ACCESS_TOKEN = 'test-token'
      process.env.CLICKUP_LIST_ID = 'list-99'

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tasks: [
            {
              id: 'task-1',
              name: 'Deploy API',
              description: 'Deploy the API to production',
              status: { name: 'in progress', color: '#ffa500' },
              assignees: [{ id: 'u1', username: 'alice' }],
              list: { id: 'list-99', name: 'Sprint' },
              space: { id: 'space-1' },
              priority: { id: '1', priority: 'urgent' },
              due_date: '1735689600000',
              date_created: '1735603200000',
              date_updated: '1735603200000',
              tags: [{ name: 'deploy' }],
            },
          ],
        }),
      }))

      try {
        const result = await clickupAdapter.pull({}, new Date(0))
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('clickup-task-1')
        expect(result[0].channel).toBe('clickup')
        expect(result[0].sender).toBe('alice')
        expect(result[0].subject).toBe('Deploy API')
        expect(result[0].isActionable).toBe(true)
        expect(result[0].priority).toBe('critical') // urgent maps to critical
      } finally {
        if (origToken) process.env.CLICKUP_ACCESS_TOKEN = origToken
        else delete process.env.CLICKUP_ACCESS_TOKEN
        if (origListId) process.env.CLICKUP_LIST_ID = origListId
        else delete process.env.CLICKUP_LIST_ID
      }
    })

    it('pull marks closed tasks as not actionable', async () => {
      const origToken = process.env.CLICKUP_ACCESS_TOKEN
      const origListId = process.env.CLICKUP_LIST_ID
      process.env.CLICKUP_ACCESS_TOKEN = 'test-token'
      process.env.CLICKUP_LIST_ID = 'list-99'

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tasks: [
            {
              id: 'task-2',
              name: 'Completed Task',
              status: { name: 'complete', color: '#00ff00' },
              assignees: [],
              list: { id: 'list-99', name: 'Sprint' },
              space: { id: 'space-1' },
              date_updated: '1735603200000',
            },
          ],
        }),
      }))

      try {
        const result = await clickupAdapter.pull({}, new Date(0))
        expect(result[0].isActionable).toBe(false)
      } finally {
        if (origToken) process.env.CLICKUP_ACCESS_TOKEN = origToken
        else delete process.env.CLICKUP_ACCESS_TOKEN
        if (origListId) process.env.CLICKUP_LIST_ID = origListId
        else delete process.env.CLICKUP_LIST_ID
      }
    })

    it('pull handles API failure and returns empty', async () => {
      const origToken = process.env.CLICKUP_ACCESS_TOKEN
      const origListId = process.env.CLICKUP_LIST_ID
      process.env.CLICKUP_ACCESS_TOKEN = 'test-token'
      process.env.CLICKUP_LIST_ID = 'list-99'

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      try {
        const result = await clickupAdapter.pull({}, new Date())
        expect(result).toEqual([])
      } finally {
        if (origToken) process.env.CLICKUP_ACCESS_TOKEN = origToken
        else delete process.env.CLICKUP_ACCESS_TOKEN
        if (origListId) process.env.CLICKUP_LIST_ID = origListId
        else delete process.env.CLICKUP_LIST_ID
      }
    })

    it('isAvailable checks environment variables', async () => {
      const origToken = process.env.CLICKUP_ACCESS_TOKEN
      const origPat = process.env.CLICKUP_PAT

      try {
        process.env.CLICKUP_ACCESS_TOKEN = 'test-token'
        expect(await clickupAdapter.isAvailable()).toBe(true)

        delete process.env.CLICKUP_ACCESS_TOKEN
        process.env.CLICKUP_PAT = 'test-pat'
        expect(await clickupAdapter.isAvailable()).toBe(true)

        delete process.env.CLICKUP_PAT
        expect(await clickupAdapter.isAvailable()).toBe(false)
      } finally {
        if (origToken) process.env.CLICKUP_ACCESS_TOKEN = origToken
        else delete process.env.CLICKUP_ACCESS_TOKEN
        if (origPat) process.env.CLICKUP_PAT = origPat
        else delete process.env.CLICKUP_PAT
      }
    })

    it('pull prefers config token over env token', async () => {
      const origToken = process.env.CLICKUP_ACCESS_TOKEN
      const origListId = process.env.CLICKUP_LIST_ID
      process.env.CLICKUP_ACCESS_TOKEN = 'env-token'
      process.env.CLICKUP_LIST_ID = 'list-99'

      let capturedHeaders: Record<string, string> = {}
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>
        return Promise.resolve({
          ok: true,
          json: async () => ({ tasks: [] }),
        })
      }))

      try {
        await clickupAdapter.pull({ accessToken: 'config-token' }, new Date())
        expect(capturedHeaders.Authorization).toBe('config-token')
      } finally {
        if (origToken) process.env.CLICKUP_ACCESS_TOKEN = origToken
        else delete process.env.CLICKUP_ACCESS_TOKEN
        if (origListId) process.env.CLICKUP_LIST_ID = origListId
        else delete process.env.CLICKUP_LIST_ID
      }
    })
  })
})
