import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnifiedToolCatalog } from '../index'

vi.mock('../../../composio', async () => ({
  isComposioEnabled: vi.fn(() => true),
  getComposioClient: vi.fn(() => ({
    create: vi.fn().mockResolvedValue({
      tools: vi.fn().mockResolvedValue([
        {
          name: 'GMAIL_SEND_EMAIL',
          description: 'Send an email via Gmail',
          inputSchema: {
            type: 'object',
            properties: { to: { type: 'string' } },
            required: ['to'],
          },
        },
      ]),
    }),
  })),
  listConnectedAccounts: vi.fn().mockResolvedValue([
    { id: 'acc-1', status: 'ACTIVE', toolkit: 'gmail' },
  ]),
}))

const mockNativeTool = {
  name: 'search_tasks',
  description: 'Search your task list for matching items',
  input_schema: {
    type: 'object' as const,
    properties: { query: { type: 'string' } },
  },
}

describe('UnifiedToolCatalog', () => {
  let supabase: any

  beforeEach(() => {
    supabase = { from: vi.fn() }
  })

  it('lists native descriptors without calling Composio', async () => {
    const catalog = new UnifiedToolCatalog({
      nativeTools: [mockNativeTool as any],
      nativeHandlers: {
        search_tasks: vi.fn().mockResolvedValue({ success: true, data: [] }),
      },
    })

    const descriptors = await catalog.listDescriptors('org-1')
    expect(descriptors.length).toBeGreaterThanOrEqual(1)
    const native = descriptors.find(d => d.name === 'search_tasks')
    expect(native).toBeDefined()
    expect(native?.source).toBe('native')
  })

  it('lists Composio descriptors with composio.* prefix', async () => {
    const catalog = new UnifiedToolCatalog({
      nativeTools: [mockNativeTool as any],
      nativeHandlers: {},
    })

    const descriptors = await catalog.listDescriptors('org-1')
    const gmail = descriptors.find(d => d.name === 'composio.GMAIL_SEND_EMAIL')
    expect(gmail).toBeDefined()
    expect(gmail?.source).toBe('composio')
    expect(gmail?.provider).toBe('gmail')
  })

  it('caches descriptors within TTL', async () => {
    const composioMod = await import('../../../composio')
    ;(composioMod.listConnectedAccounts as any).mockClear()

    const catalog = new UnifiedToolCatalog({
      nativeTools: [],
      nativeHandlers: {},
    })

    // Use a unique orgId so the catalog's LRU cache doesn't collide
    // with earlier tests in this file.
    await catalog.listDescriptors('org-cache-test')
    await catalog.listDescriptors('org-cache-test')

    // listConnectedAccounts should be called only once thanks to cache.
    expect((composioMod.listConnectedAccounts as any).mock.calls.length).toBe(1)
  })

  it('loadSchema returns native tool for known native name', async () => {
    const catalog = new UnifiedToolCatalog({
      nativeTools: [mockNativeTool as any],
      nativeHandlers: {},
    })
    const schema = await catalog.loadSchema('search_tasks', 'org-1')
    expect(schema?.name).toBe('search_tasks')
  })

  it('loadSchema fetches Composio schema on demand', async () => {
    const catalog = new UnifiedToolCatalog({
      nativeTools: [],
      nativeHandlers: {},
    })
    const schema = await catalog.loadSchema('composio.GMAIL_SEND_EMAIL', 'org-1')
    expect(schema?.name).toBe('composio.GMAIL_SEND_EMAIL')
    expect(schema?.input_schema).toMatchObject({
      type: 'object',
      properties: { to: { type: 'string' } },
    })
  })

  it('dispatch routes native tool names to native handlers', async () => {
    const handler = vi.fn().mockResolvedValue({ success: true, data: { tasks: [] } })
    const catalog = new UnifiedToolCatalog({
      nativeTools: [mockNativeTool as any],
      nativeHandlers: { search_tasks: handler },
    })

    const result = await catalog.dispatch('search_tasks', { query: 'x' }, { orgId: 'org-1', supabase })
    expect(handler).toHaveBeenCalledWith({ query: 'x' }, 'org-1', supabase)
    expect(result.success).toBe(true)
  })

  it('dispatch returns error for unknown tool', async () => {
    const catalog = new UnifiedToolCatalog({
      nativeTools: [],
      nativeHandlers: {},
    })

    const result = await catalog.dispatch('does_not_exist', {}, { orgId: 'org-1', supabase })
    expect(result).toEqual({ success: false, error: 'Unknown tool: does_not_exist' })
  })
})
