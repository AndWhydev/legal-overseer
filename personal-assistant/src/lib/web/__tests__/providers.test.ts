import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tavilyProvider } from '../providers/tavily'
import { serperProvider } from '../providers/serper'
import { exaProvider } from '../providers/exa'
import { jinaProvider } from '../providers/jina'
import { markdownNewProvider } from '../providers/markdown-new'
import { rawFetchProvider } from '../providers/raw-fetch'

describe('search providers', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('tavily', () => {
    it('reports not configured when env var missing', () => {
      expect(tavilyProvider.isConfigured()).toBe(false)
    })

    it('reports configured when env var set', () => {
      vi.stubEnv('TAVILY_API_KEY', 'test-key')
      expect(tavilyProvider.isConfigured()).toBe(true)
    })

    it('has correct name', () => {
      expect(tavilyProvider.name).toBe('tavily')
    })

    it('calls correct endpoint', async () => {
      vi.stubEnv('TAVILY_API_KEY', 'test-key')
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [{ title: 'Test', url: 'https://example.com', content: 'snippet' }],
          answer: 'AI answer',
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await tavilyProvider.search('test query', 5)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      )
      expect(result.results).toHaveLength(1)
      expect(result.results[0].title).toBe('Test')
      expect(result.answer).toBe('AI answer')
    })

    it('throws on non-ok response', async () => {
      vi.stubEnv('TAVILY_API_KEY', 'test-key')
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
      }))

      await expect(tavilyProvider.search('test', 5)).rejects.toThrow('Tavily API error 429')
    })
  })

  describe('serper', () => {
    it('reports not configured when env var missing', () => {
      expect(serperProvider.isConfigured()).toBe(false)
    })

    it('reports configured when env var set', () => {
      vi.stubEnv('SERPER_API_KEY', 'test-key')
      expect(serperProvider.isConfigured()).toBe(true)
    })

    it('has correct name', () => {
      expect(serperProvider.name).toBe('serper')
    })

    it('calls correct endpoint with correct header', async () => {
      vi.stubEnv('SERPER_API_KEY', 'test-key')
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          organic: [{ title: 'Result', link: 'https://example.com', snippet: 'text' }],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await serperProvider.search('test query', 5)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://google.serper.dev/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'X-API-KEY': 'test-key' }),
        })
      )
      expect(result.results).toHaveLength(1)
      expect(result.results[0].url).toBe('https://example.com')
    })
  })

  describe('exa', () => {
    it('reports not configured when env var missing', () => {
      expect(exaProvider.isConfigured()).toBe(false)
    })

    it('reports configured when env var set', () => {
      vi.stubEnv('EXA_API_KEY', 'test-key')
      expect(exaProvider.isConfigured()).toBe(true)
    })

    it('has correct name', () => {
      expect(exaProvider.name).toBe('exa')
    })

    it('calls correct endpoint', async () => {
      vi.stubEnv('EXA_API_KEY', 'test-key')
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [{ title: 'Exa Result', url: 'https://example.com', text: 'content' }],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await exaProvider.search('test query', 5)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.exa.ai/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
        })
      )
      expect(result.results).toHaveLength(1)
    })
  })
})

describe('read providers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('jina', () => {
    it('is always configured (no key needed)', () => {
      expect(jinaProvider.isConfigured()).toBe(true)
    })

    it('has correct name', () => {
      expect(jinaProvider.name).toBe('jina')
    })

    it('calls r.jina.ai with correct URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('# Page Title\n\nPage content here'),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await jinaProvider.read('https://example.com/page')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://example.com/page',
        expect.objectContaining({
          headers: expect.objectContaining({ 'Accept': 'text/markdown' }),
        })
      )
      expect(result.content).toContain('Page content here')
    })

    it('throws on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      }))

      await expect(jinaProvider.read('https://example.com')).rejects.toThrow('Jina Reader error 500')
    })
  })

  describe('markdown-new', () => {
    it('is always configured', () => {
      expect(markdownNewProvider.isConfigured()).toBe(true)
    })

    it('has correct name', () => {
      expect(markdownNewProvider.name).toBe('markdown-new')
    })

    it('calls markdown.new with correct URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('# Converted\n\nMarkdown content'),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await markdownNewProvider.read('https://example.com/page')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://markdown.new/https://example.com/page',
        expect.any(Object)
      )
      expect(result.content).toContain('Markdown content')
    })
  })

  describe('raw-fetch', () => {
    it('is always configured', () => {
      expect(rawFetchProvider.isConfigured()).toBe(true)
    })

    it('has correct name', () => {
      expect(rawFetchProvider.name).toBe('raw-fetch')
    })

    it('strips HTML and returns text', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><head><title>My Page</title></head><body><h1>Hello</h1><p>World</p></body></html>'),
      }))

      const result = await rawFetchProvider.read('https://example.com')

      expect(result.content).toContain('Hello')
      expect(result.content).toContain('World')
      expect(result.content).not.toContain('<h1>')
      expect(result.title).toBe('My Page')
    })
  })
})
