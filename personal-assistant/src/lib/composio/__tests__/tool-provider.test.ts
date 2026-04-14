import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock logger
vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Set env before import
vi.stubEnv('COMPOSIO_API_KEY', 'test-key')

import {
  getComposioToolsForOrg,
  executeComposioAction,
  executeComposioToolForOrg,
  invalidateComposioToolCache,
} from '../tool-provider'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSupabase(connections: Array<Record<string, unknown>> | null = null, error: { message: string } | null = null) {
  const result = { data: connections, error }
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnValue(result),
  }
  return {
    from: vi.fn().mockReturnValue(builder),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

function composioActionResponse(items: Array<{ name: string; description?: string; parameters?: Record<string, unknown> }>) {
  return {
    ok: true,
    json: () => Promise.resolve({ items }),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('composio/tool-provider', () => {
  beforeEach(() => {
    invalidateComposioToolCache('*')
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('COMPOSIO_API_KEY', 'test-key')
  })

  describe('getComposioToolsForOrg', () => {
    it('returns empty when no COMPOSIO_API_KEY', async () => {
      vi.stubEnv('COMPOSIO_API_KEY', '')
      const supabase = mockSupabase()
      const result = await getComposioToolsForOrg('org-1', supabase)
      expect(result.tools).toHaveLength(0)
      expect(result.connectionMap.size).toBe(0)
    })

    it('returns empty when org has no connections', async () => {
      const supabase = mockSupabase([])
      const result = await getComposioToolsForOrg('org-1', supabase)
      expect(result.tools).toHaveLength(0)
    })

    it('fetches actions for connected toolkits', async () => {
      const supabase = mockSupabase([
        {
          provider: 'gmail',
          connected_account_id: 'acc-123',
          status: 'connected',
          config: { composio_toolkit: 'gmail' },
        },
      ])

      // Mock the Composio actions API — use mockImplementation since fetchToolkitActions
      // may make supplementary calls when < 5 results
      mockFetch.mockImplementation(() =>
        Promise.resolve(composioActionResponse([
          {
            name: 'GMAIL_SEND_EMAIL',
            description: 'Send an email',
            parameters: { type: 'object', properties: { to: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'body'] },
          },
          {
            name: 'GMAIL_LIST_EMAILS',
            description: 'List emails',
            parameters: { type: 'object', properties: { limit: { type: 'number' } }, required: [] },
          },
        ])),
      )

      const result = await getComposioToolsForOrg('org-1', supabase)

      expect(result.tools).toHaveLength(2)
      expect(result.tools[0].name).toBe('GMAIL_SEND_EMAIL')
      expect(result.tools[1].name).toBe('GMAIL_LIST_EMAILS')
      expect(result.connectionMap.get('GMAIL_SEND_EMAIL')).toBe('acc-123')
      expect(result.connectionMap.get('GMAIL_LIST_EMAILS')).toBe('acc-123')

      // Descriptions should have the INTERNAL prefix
      expect(result.tools[0].description).toContain('[INTERNAL')
      expect(result.tools[0].description).toContain('Send an email')
    })

    it('caches results and returns from cache on second call', async () => {
      const supabase = mockSupabase([
        { provider: 'slack', connected_account_id: 'acc-456', status: 'connected', config: { composio_toolkit: 'slack' } },
      ])

      mockFetch.mockImplementation(() =>
        Promise.resolve(composioActionResponse([
          { name: 'SLACK_SEND_MESSAGE', description: 'Send message', parameters: { type: 'object', properties: {}, required: [] } },
        ])),
      )

      const result1 = await getComposioToolsForOrg('org-2', supabase)
      const result2 = await getComposioToolsForOrg('org-2', supabase)

      expect(result1.tools).toHaveLength(1)
      expect(result2.tools).toHaveLength(1)
      // Supabase should only be called once (cached second time)
      expect(supabase.from).toHaveBeenCalledTimes(1)
    })

    it('invalidateComposioToolCache clears org cache', async () => {
      const supabase = mockSupabase([
        { provider: 'gmail', connected_account_id: 'acc-789', status: 'connected', config: { composio_toolkit: 'gmail' } },
      ])

      mockFetch.mockImplementation(() =>
        Promise.resolve(composioActionResponse([
          { name: 'GMAIL_SEND_EMAIL', description: 'Send', parameters: { type: 'object', properties: {}, required: [] } },
        ])),
      )

      await getComposioToolsForOrg('org-3', supabase)
      expect(supabase.from).toHaveBeenCalledTimes(1)

      invalidateComposioToolCache('org-3')

      await getComposioToolsForOrg('org-3', supabase)
      // Should query DB again after invalidation
      expect(supabase.from).toHaveBeenCalledTimes(2)
    })

    it('handles multiple connections', async () => {
      const supabase = mockSupabase([
        { provider: 'gmail', connected_account_id: 'acc-gmail', status: 'connected', config: { composio_toolkit: 'gmail' } },
        { provider: 'slack', connected_account_id: 'acc-slack', status: 'connected', config: { composio_toolkit: 'slack' } },
      ])

      // Route fetch by URL — fetchToolkitActions may make multiple calls per toolkit
      // (tagged + supplement when < 5 results)
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('toolkit_slugs=gmail')) {
          return Promise.resolve(composioActionResponse([
            { name: 'GMAIL_SEND_EMAIL', description: 'Send email', parameters: { type: 'object', properties: {}, required: [] } },
          ]))
        }
        if (typeof url === 'string' && url.includes('toolkit_slugs=slack')) {
          return Promise.resolve(composioActionResponse([
            { name: 'SLACK_SEND_MESSAGE', description: 'Send message', parameters: { type: 'object', properties: {}, required: [] } },
          ]))
        }
        return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('Not found') })
      })

      const result = await getComposioToolsForOrg('org-multi', supabase)

      expect(result.tools).toHaveLength(2)
      expect(result.connectionMap.get('GMAIL_SEND_EMAIL')).toBe('acc-gmail')
      expect(result.connectionMap.get('SLACK_SEND_MESSAGE')).toBe('acc-slack')
    })

    it('deduplicates tools with same name across connections', async () => {
      const supabase = mockSupabase([
        { provider: 'gmail', connected_account_id: 'acc-1', status: 'connected', config: { composio_toolkit: 'gmail' } },
        { provider: 'gmail', connected_account_id: 'acc-2', status: 'connected', config: { composio_toolkit: 'gmail' } },
      ])

      mockFetch.mockImplementation(() =>
        Promise.resolve(composioActionResponse([
          { name: 'GMAIL_SEND_EMAIL', description: 'Send', parameters: { type: 'object', properties: {}, required: [] } },
        ])),
      )

      const result = await getComposioToolsForOrg('org-dedup', supabase)

      expect(result.tools).toHaveLength(1)
      // First connection wins
      expect(result.connectionMap.get('GMAIL_SEND_EMAIL')).toBe('acc-1')
    })
  })

  describe('executeComposioAction', () => {
    it('executes action via REST and returns result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { messageId: 'msg-1' }, successfull: true }),
      })

      const result = await executeComposioAction('GMAIL_SEND_EMAIL', { to: 'test@test.com' }, 'acc-123')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ messageId: 'msg-1' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v3/actions/GMAIL_SEND_EMAIL/execute'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"connected_account_id":"acc-123"'),
        }),
      )
    })

    it('returns error on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      })

      const result = await executeComposioAction('GMAIL_SEND_EMAIL', {}, 'acc-123')
      expect(result.success).toBe(false)
      expect(result.error).toContain('400')
    })

    it('returns error when action reports failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ error: 'Rate limited', successfull: false }),
      })

      const result = await executeComposioAction('GMAIL_SEND_EMAIL', {}, 'acc-123')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Rate limited')
    })

    it('returns error when COMPOSIO_API_KEY not set', async () => {
      vi.stubEnv('COMPOSIO_API_KEY', '')
      const result = await executeComposioAction('GMAIL_SEND_EMAIL', {}, 'acc-123')
      expect(result.success).toBe(false)
      expect(result.error).toContain('not configured')
    })
  })

  describe('executeComposioToolForOrg', () => {
    it('returns null when tool is not a Composio tool', async () => {
      const supabase = mockSupabase([])
      const result = await executeComposioToolForOrg('org-1', 'unknown_tool', {}, supabase)
      expect(result).toBeNull()
    })

    it('executes when tool is in connection map', async () => {
      const supabase = mockSupabase([
        { provider: 'gmail', connected_account_id: 'acc-exec', status: 'connected', config: { composio_toolkit: 'gmail' } },
      ])

      // Populate cache with actions
      mockFetch.mockImplementation(() =>
        Promise.resolve(composioActionResponse([
          { name: 'GMAIL_SEND_EMAIL', description: 'Send', parameters: { type: 'object', properties: {}, required: [] } },
        ])),
      )
      await getComposioToolsForOrg('org-exec', supabase)

      // Now mock the execute call
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/execute')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { sent: true }, successfull: true }),
          })
        }
        // Action schema fetches (cached, shouldn't be called)
        return Promise.resolve(composioActionResponse([]))
      })

      const result = await executeComposioToolForOrg('org-exec', 'GMAIL_SEND_EMAIL', { to: 'a@b.com' }, supabase)
      expect(result).not.toBeNull()
      expect(result!.success).toBe(true)
      expect(result!.data).toEqual({ sent: true })
    })
  })
})
