// src/lib/agent/tools/web-tools.ts

import Anthropic from '@anthropic-ai/sdk'
import * as cheerio from 'cheerio'
import { tavilyProvider } from '@/lib/web/providers/tavily'
import { serperProvider } from '@/lib/web/providers/serper'
import { exaProvider } from '@/lib/web/providers/exa'
import { jinaProvider } from '@/lib/web/providers/jina'
import { markdownNewProvider } from '@/lib/web/providers/markdown-new'
import { rawFetchProvider } from '@/lib/web/providers/raw-fetch'
import { canUse, recordUse } from '@/lib/web/rate-limiter'
import type { WebSearchProvider, WebReadProvider } from '@/lib/web/provider-types'
import type { AgentToolHandler } from '../tools'

const searchProviders: WebSearchProvider[] = [tavilyProvider, serperProvider, exaProvider]
const readProviders: WebReadProvider[] = [jinaProvider, markdownNewProvider, rawFetchProvider]

export const webToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'web_search',
    description:
      'Search the web for current information. Returns ranked results with titles, URLs, and snippets. Use this when you need facts, data, news, or answers not in your training data or the user\'s stored context. For research tasks: search first, then use web_read on the most relevant results to get full page content before answering.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'number', description: 'Number of results (default 5, max 10)' },
        search_depth: {
          type: 'string',
          enum: ['basic', 'advanced'],
          description: 'Search depth (default basic). Advanced returns better results but costs more.',
        },
        provider: {
          type: 'string',
          enum: ['tavily', 'serper', 'exa'],
          description: 'Force a specific provider. If omitted, uses first available.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_read',
    description:
      'Read a webpage and return its content as clean text. Use after web_search to read full page content, or when the user gives you a URL. Returns markdown-formatted text. If the page is very long, content is truncated — ask for a specific section if needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to read' },
        max_length: { type: 'number', description: 'Max characters to return (default 20000)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'web_extract',
    description:
      'Extract specific data from a webpage using CSS selectors. Use when you need structured information (prices, names, links, emails, table data) rather than reading the full page. Pass field names mapped to CSS selectors. Returns extracted data as JSON.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to extract from' },
        selectors: {
          type: 'object',
          description: 'Map of field names to CSS selectors, e.g. {"title": "h1", "prices": ".price"}',
          additionalProperties: { type: 'string' },
        },
        multiple: {
          type: 'boolean',
          description: 'Return all matches per selector as arrays (default true)',
        },
      },
      required: ['url', 'selectors'],
    },
  },
  {
    name: 'web_crawl',
    description:
      'Crawl a website starting from a URL, following same-domain links. Use to read documentation sites, multi-page articles, or explore a site\'s structure. Returns content from up to 10 linked pages. Use the pattern parameter to filter which links to follow.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Starting URL' },
        max_pages: { type: 'number', description: 'Max pages to read (default 5, max 10)' },
        pattern: { type: 'string', description: 'URL path pattern filter (glob-style), e.g. "/docs/*"' },
      },
      required: ['url'],
    },
  },
]

async function cascadeSearch(
  query: string,
  maxResults: number,
  options?: Record<string, unknown>
): Promise<{ results: unknown[]; answer?: string; provider: string }> {
  const forcedProvider = options?.provider as string | undefined
  const providers = forcedProvider
    ? searchProviders.filter(p => p.name === forcedProvider)
    : searchProviders

  for (const provider of providers) {
    if (!provider.isConfigured()) continue
    if (!canUse(provider.name)) continue

    try {
      recordUse(provider.name)
      const response = await provider.search(query, maxResults, options)
      return { ...response, provider: provider.name }
    } catch (err) {
      console.warn(`[web_search] ${provider.name} failed: ${err instanceof Error ? err.message : err}`)
      continue
    }
  }

  throw new Error('No search providers available. Set TAVILY_API_KEY, SERPER_API_KEY, or EXA_API_KEY.')
}

async function cascadeRead(url: string): Promise<{ content: string; title?: string; provider: string }> {
  for (const provider of readProviders) {
    if (!provider.isConfigured()) continue

    try {
      const response = await provider.read(url)
      return { ...response, provider: provider.name }
    } catch (err) {
      console.warn(`[web_read] ${provider.name} failed: ${err instanceof Error ? err.message : err}`)
      continue
    }
  }

  throw new Error(`Failed to read ${url} — all providers failed.`)
}

export const webToolHandlers: Record<string, AgentToolHandler> = {
  async web_search(input, _orgId, _supabase) {
    const query = input.query as string
    if (!query) return { success: false, error: 'query is required' }

    const maxResults = Math.min((input.max_results as number) || 5, 10)
    const options: Record<string, unknown> = {}
    if (input.search_depth) options.search_depth = input.search_depth
    if (input.provider) options.provider = input.provider

    try {
      const result = await cascadeSearch(query, maxResults, options)
      return { success: true, data: { ...result, query } }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  async web_read(input, _orgId, _supabase) {
    const url = input.url as string
    if (!url) return { success: false, error: 'url is required' }

    const maxLength = (input.max_length as number) || 20000

    try {
      const result = await cascadeRead(url)
      const truncated = result.content.length > maxLength
      const content = truncated ? result.content.slice(0, maxLength) : result.content
      return {
        success: true,
        data: { content, title: result.title, url, provider: result.provider, truncated },
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  async web_extract(input, _orgId, _supabase) {
    const url = input.url as string
    const selectors = input.selectors as Record<string, string> | undefined
    if (!url) return { success: false, error: 'url is required' }
    if (!selectors || Object.keys(selectors).length === 0) {
      return { success: false, error: 'selectors is required (map of field names to CSS selectors)' }
    }

    const multiple = (input.multiple as boolean) ?? true

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'BitBit/1.0 (web extractor)' },
      })
      if (!res.ok) throw new Error(`Fetch error ${res.status}`)

      const html = await res.text()
      const $ = cheerio.load(html)
      const data: Record<string, string | string[]> = {}

      for (const [field, selector] of Object.entries(selectors)) {
        const elements = $(selector)
        if (multiple) {
          data[field] = elements.map((_, el) => $(el).text().trim()).get()
        } else {
          data[field] = elements.first().text().trim()
        }
      }

      return { success: true, data: { data, url } }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  async web_crawl(input, _orgId, _supabase) {
    const startUrl = input.url as string
    if (!startUrl) return { success: false, error: 'url is required' }

    const maxPages = Math.min((input.max_pages as number) || 5, 10)
    const pattern = input.pattern as string | undefined

    try {
      const startUrlObj = new URL(startUrl)
      const baseDomain = startUrlObj.hostname

      const startPage = await cascadeRead(startUrl)

      const res = await fetch(startUrl, {
        headers: { 'User-Agent': 'BitBit/1.0 (web crawler)' },
      })
      const html = await res.text()
      const $ = cheerio.load(html)

      const links: string[] = []
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return

        try {
          const resolved = new URL(href, startUrl)
          if (resolved.hostname !== baseDomain) return
          if (resolved.href === startUrl) return

          if (pattern) {
            const pathPattern = pattern.replace(/\*/g, '.*')
            if (!new RegExp(`^${pathPattern}$`).test(resolved.pathname)) return
          }

          if (!links.includes(resolved.href)) {
            links.push(resolved.href)
          }
        } catch {
          // skip invalid URLs
        }
      })

      const totalFound = links.length
      const pagesToRead = links.slice(0, maxPages - 1)
      const pages = [{ url: startUrl, title: startPage.title, content: startPage.content }]

      for (const link of pagesToRead) {
        try {
          const page = await cascadeRead(link)
          pages.push({ url: link, title: page.title, content: page.content })
        } catch {
          // skip failed pages
        }
      }

      return { success: true, data: { pages, total_found: totalFound } }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}
