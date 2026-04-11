import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  fetchAsanaWorkspaces,
  fetchAsanaTasks,
  createAsanaTask,
  updateAsanaTask,
  registerAsanaWebhook,
  parseAsanaWebhookEvents,
} from '../asana'

vi.mock('@/lib/integrations/credentials', () => ({
  getOrgCredential: vi.fn(),
}))

import { getOrgCredential } from '@/lib/integrations/credentials'
const mockGetCreds = vi.mocked(getOrgCredential)

afterEach(() => vi.restoreAllMocks())

const MOCK_CREDS = { access_token: 'asana-pat-test' }

describe('fetchAsanaWorkspaces', () => {
  it('returns error when no credentials', async () => {
    mockGetCreds.mockResolvedValue(null)
    const result = await fetchAsanaWorkspaces({} as any, 'org-1')
    expect(result).toHaveProperty('error')
  })

  it('fetches workspaces from Asana API', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ gid: 'ws-1', name: 'AWU Workspace' }],
      }),
    }))

    const result = await fetchAsanaWorkspaces({} as any, 'org-1')
    expect(Array.isArray(result)).toBe(true)
    expect((result as any[])[0].name).toBe('AWU Workspace')
  })
})

describe('fetchAsanaTasks', () => {
  it('requires projectGid or workspaceGid', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    const result = await fetchAsanaTasks({} as any, 'org-1', {})
    expect(result).toHaveProperty('error')
    expect((result as any).error).toContain('Either projectGid or workspaceGid')
  })

  it('fetches tasks by project', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { gid: 't1', name: 'Design mockups', completed: false, notes: 'Create design' },
        ],
      }),
    }))

    const result = await fetchAsanaTasks({} as any, 'org-1', { projectGid: 'proj-1' })
    expect(Array.isArray(result)).toBe(true)
    expect((result as any[])[0].name).toBe('Design mockups')
  })
})

describe('createAsanaTask', () => {
  it('creates a task via API', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { gid: 't-new', name: 'New task', completed: false },
      }),
    }))

    const result = await createAsanaTask({} as any, 'org-1', {
      name: 'New task',
      workspace: 'ws-1',
    })
    expect(result).toHaveProperty('gid', 't-new')
  })
})

describe('updateAsanaTask', () => {
  it('updates a task via API', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { gid: 't1', name: 'Updated task', completed: true },
      }),
    }))

    const result = await updateAsanaTask({} as any, 'org-1', 't1', { completed: true })
    expect(result).toHaveProperty('completed', true)
  })
})

describe('registerAsanaWebhook', () => {
  it('registers a webhook', async () => {
    mockGetCreds.mockResolvedValue(MOCK_CREDS)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { gid: 'wh-1' } }),
    }))

    const result = await registerAsanaWebhook({} as any, 'org-1', 'proj-1', 'https://hook.example.com')
    expect(result).toHaveProperty('gid', 'wh-1')
  })
})

describe('parseAsanaWebhookEvents', () => {
  it('extracts events from webhook body', () => {
    const events = parseAsanaWebhookEvents({
      events: [
        { action: 'changed', resource: { gid: 't1', resource_type: 'task' } },
        { action: 'added', resource: { gid: 't2', resource_type: 'task' } },
      ],
    })
    expect(events).toHaveLength(2)
    expect(events[0].action).toBe('changed')
  })

  it('returns empty array for missing events', () => {
    expect(parseAsanaWebhookEvents({})).toEqual([])
  })
})
