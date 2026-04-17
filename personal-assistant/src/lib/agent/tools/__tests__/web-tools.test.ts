// src/lib/agent/tools/__tests__/web-tools.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { webToolHandlers, webToolDefinitions } from '../web-tools'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/web/providers/tavily', () => ({
  tavilyProvider: {
    name: 'tavily',
    isConfigured: () => true,
    search: vi.fn().mockResolvedValue({
      results: [{ title: 'Result 1', url: 'https://example.com', snippet: 'A snippet', score: 0.9 }],
      answer: 'An answer',
    }),
  },
}))

vi.mock('@/lib/web/providers/serper', () => ({
  serperProvider: {
    name: 'serper',
    isConfigured: () => false,
    search: vi.fn(),
  },
}))

vi.mock('@/lib/web/providers/exa', () => ({
  exaProvider: {
    name: 'exa',
    isConfigured: () => false,
    search: vi.fn(),
  },
}))

vi.mock('@/lib/web/providers/jina', () => ({
  jinaProvider: {
    name: 'jina',
    isConfigured: () => true,
    read: vi.fn().mockResolvedValue({
      content: '# Title\n\nPage content here that is useful.',
      title: 'Title',
    }),
  },
}))

vi.mock('@/lib/web/providers/markdown-new', () => ({
  markdownNewProvider: {
    name: 'markdown-new',
    isConfigured: () => true,
    read: vi.fn(),
  },
}))

vi.mock('@/lib/web/providers/raw-fetch', () => ({
  rawFetchProvider: {
    name: 'raw-fetch',
    isConfigured: () => true,
    read: vi.fn(),
  },
}))

vi.mock('@/lib/web/rate-limiter', () => ({
  canUse: vi.fn().mockReturnValue(true),
  recordUse: vi.fn(),
  getRemainingQuota: vi.fn().mockReturnValue(50),
}))

const mockSupabase = {} as SupabaseClient

describe('web tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('tool definitions', () => {
    it('exports 5 tool definitions', () => {
      expect(webToolDefinitions).toHaveLength(5)
    })

    it('defines web_search', () => {
      const tool = webToolDefinitions.find(t => t.name === 'web_search')
      expect(tool).toBeDefined()
      expect(tool!.description).toContain('Search the web')
    })

    it('defines fetch_url', () => {
      const tool = webToolDefinitions.find(t => t.name === 'fetch_url')
      expect(tool).toBeDefined()
      expect(tool!.description).toContain('Fetch and extract readable text')
    })

    it('defines web_read', () => {
      const tool = webToolDefinitions.find(t => t.name === 'web_read')
      expect(tool).toBeDefined()
      expect(tool!.description).toContain('Read a webpage')
    })

    it('defines web_extract', () => {
      const tool = webToolDefinitions.find(t => t.name === 'web_extract')
      expect(tool).toBeDefined()
      expect(tool!.description).toContain('Extract specific data')
    })

    it('defines web_crawl', () => {
      const tool = webToolDefinitions.find(t => t.name === 'web_crawl')
      expect(tool).toBeDefined()
      expect(tool!.description).toContain('Crawl a website')
    })
  })

  describe('web_search handler', () => {
    it('returns results from first available provider', async () => {
      const result = await webToolHandlers.web_search(
        { query: 'test query', max_results: 5 },
        'org-1',
        mockSupabase
      )
      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('results')
      expect(result.data).toHaveProperty('provider', 'tavily')
    })

    it('returns error when no query provided', async () => {
      const result = await webToolHandlers.web_search({}, 'org-1', mockSupabase)
      expect(result.success).toBe(false)
      expect(result.error).toContain('query')
    })
  })

  describe('fetch_url handler', () => {
    it('returns a clear error when url is missing', async () => {
      const result = await webToolHandlers.fetch_url({}, 'org-1', mockSupabase)
      expect(result).toEqual({ success: false, error: 'URL must be a non-empty string' })
    })

    it('returns a clear error when url is not a string', async () => {
      const result = await webToolHandlers.fetch_url({ url: { href: 'https://example.com' } }, 'org-1', mockSupabase)
      expect(result).toEqual({ success: false, error: 'URL must be a non-empty string' })
    })
  })

  describe('web_read handler', () => {
    it('returns content from first available provider', async () => {
      const result = await webToolHandlers.web_read(
        { url: 'https://example.com' },
        'org-1',
        mockSupabase
      )
      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('content')
      expect(result.data).toHaveProperty('provider', 'jina')
    })

    it('truncates content at max_length', async () => {
      const result = await webToolHandlers.web_read(
        { url: 'https://example.com', max_length: 10 },
        'org-1',
        mockSupabase
      )
      expect(result.success).toBe(true)
      expect((result.data as Record<string, unknown>).truncated).toBe(true)
      expect(((result.data as Record<string, unknown>).content as string).length).toBeLessThanOrEqual(10)
    })

    it('returns error when no url provided', async () => {
      const result = await webToolHandlers.web_read({}, 'org-1', mockSupabase)
      expect(result.success).toBe(false)
      expect(result.error).toContain('url')
    })
  })

  describe('web_extract handler', () => {
    it('returns error when no url provided', async () => {
      const result = await webToolHandlers.web_extract(
        { selectors: { title: 'h1' } },
        'org-1',
        mockSupabase
      )
      expect(result.success).toBe(false)
    })

    it('returns error when no selectors provided', async () => {
      const result = await webToolHandlers.web_extract(
        { url: 'https://example.com' },
        'org-1',
        mockSupabase
      )
      expect(result.success).toBe(false)
    })
  })

  describe('web_crawl handler', () => {
    it('returns error when no url provided', async () => {
      const result = await webToolHandlers.web_crawl({}, 'org-1', mockSupabase)
      expect(result.success).toBe(false)
    })
  })
})
