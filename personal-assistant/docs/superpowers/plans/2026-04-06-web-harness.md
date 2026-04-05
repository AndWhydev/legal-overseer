# Web Harness + Prompt Tuning + Engine Tweaks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give BitBit full web access (search, read, extract, crawl) with multi-provider fallback, rewrite the system prompt, and uncap the engine iteration limit.

**Architecture:** Four new agent tools backed by six providers. Providers cascade on failure. System prompt rewritten to Claude Code's lean pattern. Engine loop runs until model stops (50-iteration safety breaker).

**Tech Stack:** Anthropic SDK (existing), Cheerio (new), Tavily/Serper/Exa/Jina REST APIs via fetch, Vitest.

---

## File Structure

### New Files
```
src/lib/web/provider-types.ts            — shared interfaces
src/lib/web/rate-limiter.ts              — in-memory daily counter
src/lib/web/providers/tavily.ts          — Tavily search
src/lib/web/providers/serper.ts          — Serper.dev search
src/lib/web/providers/exa.ts             — Exa semantic search
src/lib/web/providers/jina.ts            — Jina Reader
src/lib/web/providers/markdown-new.ts    — markdown.new reader
src/lib/web/providers/raw-fetch.ts       — fetch + Cheerio fallback
src/lib/agent/tools/web-tools.ts         — tool definitions + handlers
src/lib/web/__tests__/rate-limiter.test.ts
src/lib/web/__tests__/providers.test.ts
src/lib/agent/tools/__tests__/web-tools.test.ts
```

### Modified Files
```
package.json                             — add cheerio + @types/cheerio
src/lib/agent/tools.ts                   — register web tools
src/lib/agent/engine.ts                  — iterations, timeout, token budget
src/lib/agent/prompt-builder.ts          — full rewrite
```

---

### Task 1: Install Cheerio and Add Provider Types

**Files:**
- Modify: `personal-assistant/package.json`
- Create: `personal-assistant/src/lib/web/provider-types.ts`

- [ ] **Step 1: Install cheerio**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npm install cheerio
```

Expected: cheerio added to dependencies in package.json.

- [ ] **Step 2: Create provider-types.ts**

```typescript
// src/lib/web/provider-types.ts

export interface SearchResult {
  title: string
  url: string
  snippet: string
  score?: number
}

export interface SearchResponse {
  results: SearchResult[]
  answer?: string
}

export interface WebSearchProvider {
  name: string
  isConfigured(): boolean
  search(query: string, maxResults: number, options?: Record<string, unknown>): Promise<SearchResponse>
}

export interface ReadResponse {
  content: string
  title?: string
}

export interface WebReadProvider {
  name: string
  isConfigured(): boolean
  read(url: string): Promise<ReadResponse>
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant
git add package.json package-lock.json src/lib/web/provider-types.ts
git commit -m "feat: add cheerio dep and web provider type interfaces"
```

---

### Task 2: Rate Limiter

**Files:**
- Create: `personal-assistant/src/lib/web/rate-limiter.ts`
- Create: `personal-assistant/src/lib/web/__tests__/rate-limiter.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/web/__tests__/rate-limiter.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { canUse, recordUse, getRemainingQuota, resetAll } from '../rate-limiter'

describe('web rate-limiter', () => {
  beforeEach(() => {
    resetAll()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows use when under default limit', () => {
    expect(canUse('tavily')).toBe(true)
  })

  it('tracks usage and decrements quota', () => {
    const before = getRemainingQuota('tavily')
    recordUse('tavily')
    expect(getRemainingQuota('tavily')).toBe(before - 1)
  })

  it('blocks when quota exhausted', () => {
    vi.stubEnv('TAVILY_DAILY_LIMIT', '2')
    resetAll()
    recordUse('tavily')
    recordUse('tavily')
    expect(canUse('tavily')).toBe(false)
    expect(getRemainingQuota('tavily')).toBe(0)
  })

  it('respects per-provider env var limits', () => {
    vi.stubEnv('SERPER_DAILY_LIMIT', '3')
    resetAll()
    expect(getRemainingQuota('serper')).toBe(3)
  })

  it('uses default limits when env vars not set', () => {
    resetAll()
    expect(getRemainingQuota('tavily')).toBe(50)
    expect(getRemainingQuota('serper')).toBe(50)
    expect(getRemainingQuota('exa')).toBe(30)
  })

  it('returns true for unknown providers (no limit)', () => {
    expect(canUse('jina')).toBe(true)
    expect(canUse('markdown-new')).toBe(true)
  })

  it('resets all counters', () => {
    recordUse('tavily')
    recordUse('serper')
    resetAll()
    expect(getRemainingQuota('tavily')).toBe(50)
    expect(getRemainingQuota('serper')).toBe(50)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx vitest run src/lib/web/__tests__/rate-limiter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement rate-limiter.ts**

```typescript
// src/lib/web/rate-limiter.ts

interface DailyCounter {
  count: number
  date: string // YYYY-MM-DD UTC
}

const counters = new Map<string, DailyCounter>()

const DEFAULT_LIMITS: Record<string, number> = {
  tavily: 50,
  serper: 50,
  exa: 30,
}

function getLimit(provider: string): number | null {
  const envKey = `${provider.toUpperCase()}_DAILY_LIMIT`
  const envVal = process.env[envKey]
  if (envVal) return parseInt(envVal, 10)
  return DEFAULT_LIMITS[provider] ?? null
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function getCounter(provider: string): DailyCounter {
  const today = todayUTC()
  const existing = counters.get(provider)
  if (existing && existing.date === today) return existing
  // Reset on new day
  const fresh: DailyCounter = { count: 0, date: today }
  counters.set(provider, fresh)
  return fresh
}

export function canUse(provider: string): boolean {
  const limit = getLimit(provider)
  if (limit === null) return true // no limit configured
  const counter = getCounter(provider)
  return counter.count < limit
}

export function recordUse(provider: string): void {
  const limit = getLimit(provider)
  if (limit === null) return // don't track unlimited providers
  const counter = getCounter(provider)
  counter.count++
}

export function getRemainingQuota(provider: string): number {
  const limit = getLimit(provider)
  if (limit === null) return Infinity
  const counter = getCounter(provider)
  return Math.max(0, limit - counter.count)
}

export function resetAll(): void {
  counters.clear()
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx vitest run src/lib/web/__tests__/rate-limiter.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant
git add src/lib/web/rate-limiter.ts src/lib/web/__tests__/rate-limiter.test.ts
git commit -m "feat: add web provider rate limiter with daily counters"
```

---

### Task 3: Search Providers (Tavily, Serper, Exa)

**Files:**
- Create: `personal-assistant/src/lib/web/providers/tavily.ts`
- Create: `personal-assistant/src/lib/web/providers/serper.ts`
- Create: `personal-assistant/src/lib/web/providers/exa.ts`
- Create: `personal-assistant/src/lib/web/__tests__/providers.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/web/__tests__/providers.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tavilyProvider } from '../providers/tavily'
import { serperProvider } from '../providers/serper'
import { exaProvider } from '../providers/exa'

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx vitest run src/lib/web/__tests__/providers.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement tavily.ts**

```typescript
// src/lib/web/providers/tavily.ts

import type { WebSearchProvider, SearchResponse } from '../provider-types'

export const tavilyProvider: WebSearchProvider = {
  name: 'tavily',

  isConfigured(): boolean {
    return !!process.env.TAVILY_API_KEY
  },

  async search(query: string, maxResults: number, options?: Record<string, unknown>): Promise<SearchResponse> {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: maxResults,
        search_depth: (options?.search_depth as string) || 'basic',
        include_answer: true,
      }),
    })

    if (!res.ok) {
      throw new Error(`Tavily API error ${res.status}: ${await res.text()}`)
    }

    const data = await res.json()
    return {
      results: (data.results || []).map((r: Record<string, unknown>) => ({
        title: r.title as string,
        url: r.url as string,
        snippet: (r.content as string) || '',
        score: r.score as number | undefined,
      })),
      answer: data.answer || undefined,
    }
  },
}
```

- [ ] **Step 4: Implement serper.ts**

```typescript
// src/lib/web/providers/serper.ts

import type { WebSearchProvider, SearchResponse } from '../provider-types'

export const serperProvider: WebSearchProvider = {
  name: 'serper',

  isConfigured(): boolean {
    return !!process.env.SERPER_API_KEY
  },

  async search(query: string, maxResults: number): Promise<SearchResponse> {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: maxResults }),
    })

    if (!res.ok) {
      throw new Error(`Serper API error ${res.status}: ${await res.text()}`)
    }

    const data = await res.json()
    return {
      results: (data.organic || []).map((r: Record<string, unknown>) => ({
        title: r.title as string,
        url: r.link as string,
        snippet: (r.snippet as string) || '',
      })),
    }
  },
}
```

- [ ] **Step 5: Implement exa.ts**

```typescript
// src/lib/web/providers/exa.ts

import type { WebSearchProvider, SearchResponse } from '../provider-types'

export const exaProvider: WebSearchProvider = {
  name: 'exa',

  isConfigured(): boolean {
    return !!process.env.EXA_API_KEY
  },

  async search(query: string, maxResults: number): Promise<SearchResponse> {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.EXA_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        num_results: maxResults,
        use_autoprompt: true,
      }),
    })

    if (!res.ok) {
      throw new Error(`Exa API error ${res.status}: ${await res.text()}`)
    }

    const data = await res.json()
    return {
      results: (data.results || []).map((r: Record<string, unknown>) => ({
        title: (r.title as string) || '',
        url: r.url as string,
        snippet: (r.text as string) || (r.highlights as string[])?.join(' ') || '',
        score: r.score as number | undefined,
      })),
    }
  },
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx vitest run src/lib/web/__tests__/providers.test.ts
```

Expected: all 11 tests PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant
git add src/lib/web/providers/tavily.ts src/lib/web/providers/serper.ts src/lib/web/providers/exa.ts src/lib/web/__tests__/providers.test.ts
git commit -m "feat: add Tavily, Serper, and Exa search providers"
```

---

### Task 4: Read Providers (Jina, markdown.new, raw-fetch)

**Files:**
- Create: `personal-assistant/src/lib/web/providers/jina.ts`
- Create: `personal-assistant/src/lib/web/providers/markdown-new.ts`
- Create: `personal-assistant/src/lib/web/providers/raw-fetch.ts`

- [ ] **Step 1: Add read provider tests to providers.test.ts**

Append to `src/lib/web/__tests__/providers.test.ts`:

```typescript
import { jinaProvider } from '../providers/jina'
import { markdownNewProvider } from '../providers/markdown-new'
import { rawFetchProvider } from '../providers/raw-fetch'

// ... after existing describe blocks:

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx vitest run src/lib/web/__tests__/providers.test.ts
```

Expected: FAIL — jina, markdown-new, raw-fetch modules not found.

- [ ] **Step 3: Implement jina.ts**

```typescript
// src/lib/web/providers/jina.ts

import type { WebReadProvider, ReadResponse } from '../provider-types'

export const jinaProvider: WebReadProvider = {
  name: 'jina',

  isConfigured(): boolean {
    return true // free, no key needed
  },

  async read(url: string): Promise<ReadResponse> {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/markdown',
      },
    })

    if (!res.ok) {
      throw new Error(`Jina Reader error ${res.status}: ${await res.text()}`)
    }

    const content = await res.text()
    // Jina returns markdown; first # heading is usually the title
    const titleMatch = content.match(/^#\s+(.+)$/m)
    return {
      content,
      title: titleMatch?.[1] || undefined,
    }
  },
}
```

- [ ] **Step 4: Implement markdown-new.ts**

```typescript
// src/lib/web/providers/markdown-new.ts

import type { WebReadProvider, ReadResponse } from '../provider-types'

export const markdownNewProvider: WebReadProvider = {
  name: 'markdown-new',

  isConfigured(): boolean {
    return true // free, no key needed
  },

  async read(url: string): Promise<ReadResponse> {
    const res = await fetch(`https://markdown.new/${url}`, {
      headers: {
        'Accept': 'text/markdown',
      },
    })

    if (!res.ok) {
      throw new Error(`markdown.new error ${res.status}: ${await res.text()}`)
    }

    const content = await res.text()
    const titleMatch = content.match(/^#\s+(.+)$/m)
    return {
      content,
      title: titleMatch?.[1] || undefined,
    }
  },
}
```

- [ ] **Step 5: Implement raw-fetch.ts**

```typescript
// src/lib/web/providers/raw-fetch.ts

import * as cheerio from 'cheerio'
import type { WebReadProvider, ReadResponse } from '../provider-types'

export const rawFetchProvider: WebReadProvider = {
  name: 'raw-fetch',

  isConfigured(): boolean {
    return true // no external dependency
  },

  async read(url: string): Promise<ReadResponse> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BitBit/1.0 (web reader)',
      },
    })

    if (!res.ok) {
      throw new Error(`Fetch error ${res.status}: ${await res.text()}`)
    }

    const html = await res.text()
    const $ = cheerio.load(html)

    // Remove script, style, nav, footer, header elements
    $('script, style, nav, footer, header, aside, [role="navigation"], [role="banner"]').remove()

    const title = $('title').text().trim() || $('h1').first().text().trim() || undefined
    const content = $('body').text().replace(/\s+/g, ' ').trim()

    return { content, title }
  },
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx vitest run src/lib/web/__tests__/providers.test.ts
```

Expected: all tests PASS (11 search + 8 read = 19 total).

- [ ] **Step 7: Commit**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant
git add src/lib/web/providers/jina.ts src/lib/web/providers/markdown-new.ts src/lib/web/providers/raw-fetch.ts src/lib/web/__tests__/providers.test.ts
git commit -m "feat: add Jina, markdown.new, and raw-fetch read providers"
```

---

### Task 5: Web Tools (web_search, web_read, web_extract, web_crawl)

**Files:**
- Create: `personal-assistant/src/lib/agent/tools/web-tools.ts`
- Create: `personal-assistant/src/lib/agent/tools/__tests__/web-tools.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/agent/tools/__tests__/web-tools.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { webToolHandlers, webToolDefinitions } from '../web-tools'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock all providers
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
    it('exports 4 tool definitions', () => {
      expect(webToolDefinitions).toHaveLength(4)
    })

    it('defines web_search', () => {
      const tool = webToolDefinitions.find(t => t.name === 'web_search')
      expect(tool).toBeDefined()
      expect(tool!.description).toContain('Search the web')
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx vitest run src/lib/agent/tools/__tests__/web-tools.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement web-tools.ts**

```typescript
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
      // Parse base domain from starting URL
      const startUrlObj = new URL(startUrl)
      const baseDomain = startUrlObj.hostname

      // Read starting page to discover links
      const startPage = await cascadeRead(startUrl)

      // Fetch raw HTML to extract links
      const res = await fetch(startUrl, {
        headers: { 'User-Agent': 'BitBit/1.0 (web crawler)' },
      })
      const html = await res.text()
      const $ = cheerio.load(html)

      // Extract same-domain links
      const links: string[] = []
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return

        try {
          const resolved = new URL(href, startUrl)
          if (resolved.hostname !== baseDomain) return
          if (resolved.href === startUrl) return

          // Pattern filter
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

      // Read pages up to maxPages (subtract 1 for the starting page)
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx vitest run src/lib/agent/tools/__tests__/web-tools.test.ts
```

Expected: all 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant
git add src/lib/agent/tools/web-tools.ts src/lib/agent/tools/__tests__/web-tools.test.ts
git commit -m "feat: add web_search, web_read, web_extract, web_crawl agent tools"
```

---

### Task 6: Register Web Tools in Agent

**Files:**
- Modify: `personal-assistant/src/lib/agent/tools.ts:1-5,240-264`

- [ ] **Step 1: Add imports**

At the top of `src/lib/agent/tools.ts`, after the existing channel-tools import (line 3), add:

```typescript
import { webToolDefinitions, webToolHandlers } from './tools/web-tools'
```

- [ ] **Step 2: Merge web handlers into allHandlers**

Change the `allHandlers` declaration (around line 240) from:

```typescript
const allHandlers: Record<string, AgentToolHandler> = {
  ...handlers,
  ...channelToolHandlers,
}
```

to:

```typescript
const allHandlers: Record<string, AgentToolHandler> = {
  ...handlers,
  ...channelToolHandlers,
  ...webToolHandlers,
}
```

- [ ] **Step 3: Add web tools to getAgentTools**

Change `getAgentTools` (around line 245) from:

```typescript
export function getAgentTools(): Anthropic.Tool[] {
  return [...toolDefinitions, ...channelToolDefinitions]
}
```

to:

```typescript
export function getAgentTools(): Anthropic.Tool[] {
  return [...toolDefinitions, ...channelToolDefinitions, ...webToolDefinitions]
}
```

- [ ] **Step 4: Verify build compiles**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant
git add src/lib/agent/tools.ts
git commit -m "feat: register web tools in agent tool registry"
```

---

### Task 7: Engine Tweaks (Iterations, Timeout, Token Budget)

**Files:**
- Modify: `personal-assistant/src/lib/agent/engine.ts`

- [ ] **Step 1: Bump maxIterations default**

In `engine.ts` line 93, change:

```typescript
  const maxIterations = config.maxIterations || 8
```

to:

```typescript
  const maxIterations = config.maxIterations || 50
```

- [ ] **Step 2: Add tool timeout to executeAgentTool**

In `tools.ts`, change the `executeAgentTool` function (lines 249-264) from:

```typescript
export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const handler = allHandlers[name]
  if (!handler) {
    return { success: false, error: `Unknown tool: ${name}` }
  }
  try {
    return await handler(input, orgId, supabase)
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
```

to:

```typescript
const TOOL_TIMEOUT_MS = 30_000

export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const handler = allHandlers[name]
  if (!handler) {
    return { success: false, error: `Unknown tool: ${name}` }
  }
  try {
    const result = await Promise.race([
      handler(input, orgId, supabase),
      new Promise<ToolResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool ${name} timed out after 30 seconds`)), TOOL_TIMEOUT_MS)
      ),
    ])
    return result
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
```

- [ ] **Step 3: Add token budget awareness to engine loop**

In `engine.ts`, add a helper function before `runAgentChat`:

```typescript
function estimateTokens(messages: Anthropic.MessageParam[]): number {
  let chars = 0
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      chars += msg.content.length
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ('text' in block) chars += (block as { text: string }).text.length
        if ('content' in block) chars += String((block as { content: unknown }).content).length
      }
    }
  }
  return Math.ceil(chars / 4) // rough: 1 token ≈ 4 chars
}
```

Then inside the `for` loop in `runAgentChat`, right before the `client.messages.create` call (line 116), add:

```typescript
    // Token budget check: nudge model to wrap up if context is getting large
    const estimatedTokens = estimateTokens(messages)
    const contextLimit = 200_000 // Sonnet context window
    if (estimatedTokens > contextLimit * 0.8) {
      yield { type: 'thinking', data: 'Context getting large, wrapping up...' }
      messages = [
        ...messages,
        { role: 'user', content: [{ type: 'text', text: 'Note: Context window is getting full. Please finish your current line of reasoning and provide your answer.' }] },
      ]
    }
```

- [ ] **Step 4: Verify build compiles**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant
git add src/lib/agent/engine.ts src/lib/agent/tools.ts
git commit -m "feat: uncap iteration limit, add tool timeout and token budget awareness"
```

---

### Task 8: System Prompt Rewrite

**Files:**
- Modify: `personal-assistant/src/lib/agent/prompt-builder.ts`

- [ ] **Step 1: Rewrite buildSystemPrompt**

Replace the entire `buildSystemPrompt` function (lines 103-225) with:

```typescript
export async function buildSystemPrompt(supabase: SupabaseClient, orgId: string, _industry?: string): Promise<string> {
  const [ctx, policyText, voiceText] = await Promise.all([
    supabase
      ? loadContext(supabase, orgId)
      : Promise.resolve({ goals: [], tasks: [], contacts: [], recentActivity: [], columns: [] }),
    loadPolicies(process.env.BITBIT_DEPLOYMENT || 'default'),
    loadVoiceProfile(process.env.BITBIT_DEPLOYMENT || 'default'),
  ])

  const now = new Date()
  const dateTime = now.toLocaleString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  const goalsSummary = ctx.goals.length > 0
    ? ctx.goals.map(g => `- [${g.priority}] ${g.description} (${g.status})`).join('\n')
    : 'No active goals set.'

  const columnMap = new Map(ctx.columns.map(c => [c.id, c.title]))
  const tasksSummary = ctx.tasks.length > 0
    ? ctx.tasks.slice(0, 30).map(t => {
      const col = t.column_id ? columnMap.get(t.column_id) ?? 'Unknown' : 'Unassigned'
      return `- [${t.priority}] ${t.title} (${col}, ${t.status})`
    }).join('\n')
    : 'No tasks on the board.'

  const contactsSummary = ctx.contacts.length > 0
    ? ctx.contacts.map(c => `- ${c.name} (${c.type})`).join('\n')
    : 'No contacts stored.'

  const recentActivitySummary = ctx.recentActivity.length > 0
    ? ctx.recentActivity.slice(0, 10).map(a =>
      `- [${a.action_type}] ${a.action}${a.result ? ` → ${a.result}` : ''}`
    ).join('\n')
    : 'No recent activity.'

  const availableColumns = ctx.columns.map(c => c.title).join(', ')

  let prompt = `You are BitBit, a personal AI that runs alongside your user's life and work.
You have access to their tasks, contacts, communications, schedule, memory, and the open web. Use your tools to take action, not just answer questions.

## Using your tools
- When you need information you don't have → web_search, then web_read the top results
- When the user provides a URL → web_read to get its content
- When you need specific data from a page (prices, emails, lists) → web_extract with CSS selectors
- When you need to read a multi-page site or docs → web_crawl
- When the user mentions a person → search_contacts to resolve them
- When the user asks about schedule or reminders → get_upcoming
- When you take a significant action → log_activity
- You can call multiple tools in sequence. Search first, read pages, then answer.
- If a tool fails, try an alternative approach before giving up.
- For complex research: search → read top 2-3 results → follow promising links → synthesize with citations.

## Current Context
Date/Time: ${dateTime}
Kanban Columns: ${availableColumns}

### Active Goals
${goalsSummary}

### Current Tasks (${ctx.tasks.length} total)
${tasksSummary}

### Known Contacts (${ctx.contacts.length})
${contactsSummary}

### Recent Activity
${recentActivitySummary}
`

  if (policyText) {
    prompt += `\n## Organization Policies\n\n${policyText}\n`
  }

  if (voiceText) {
    prompt += `\n## Voice Profile\n\n${voiceText}\n`
  }

  return prompt
}
```

- [ ] **Step 2: Remove unused imports**

At the top of `prompt-builder.ts`, remove these imports that are no longer used:

```typescript
import { getPack, resolveIndustry } from '@/lib/industry/registry'
```

Keep: `loadContext`, `assembleContext`, `loadPolicies`, `loadVoiceProfile`.

Also remove the `readCacheFile`, `getChannelSummary`, `getTodayEvents`, `getDueReminders` helper functions and their associated interfaces (`CachedEvent`, `CachedReminder`) — they are no longer called.

- [ ] **Step 3: Fix voice-loader and policy-loader file paths**

In `src/lib/agent/voice-loader.ts`, change line 26 from:

```typescript
    const projectRoot = '/home/claude/bitbit'
```

to:

```typescript
    const projectRoot = process.cwd()
```

In `src/lib/agent/policy-loader.ts`, change line 20 from:

```typescript
    const projectRoot = '/home/claude/bitbit'
```

to:

```typescript
    const projectRoot = process.cwd()
```

- [ ] **Step 4: Sharpen existing tool descriptions in tools.ts**

In `src/lib/agent/tools.ts`, update the tool descriptions in `toolDefinitions`:

Change `create_task` description (line 30) from:
```
'Create a new task on the kanban board. Use this when the user asks to add a task, todo, or action item.'
```
to:
```
'Create a task on the kanban board. Use when the user asks to add a task, todo, or action item. Set priority and column. Returns the created task.'
```

Change `log_activity` description (line 106) from:
```
'Log an action to the activity feed for transparency and auditability.'
```
to:
```
'Log an action to the activity feed. Use after completing significant actions (sending emails, creating tasks, finishing research) so the user can see what you did.'
```

Change `search_memory` description (line 124) from:
```
'Search stored memory/knowledge entries for learned patterns and preferences.'
```
to:
```
'Search stored memories by keyword or category. Use when the user asks about something you may have learned in past sessions.'
```

Change `add_memory` description (line 134) from:
```
'Store a new memory/knowledge entry. Use to remember user preferences, patterns, and important context.'
```
to:
```
'Store a memory. Use when the user tells you a preference, pattern, or fact worth remembering across sessions. Don\'t store ephemeral task details.'
```

- [ ] **Step 5: Verify build compiles**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant
git add src/lib/agent/prompt-builder.ts src/lib/agent/voice-loader.ts src/lib/agent/policy-loader.ts src/lib/agent/tools.ts
git commit -m "feat: rewrite system prompt — lean identity, tool guidance, remove dead weight"
```

---

### Task 9: Run All Tests and Verify Build

**Files:** None (verification only)

- [ ] **Step 1: Run all web-related tests**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx vitest run src/lib/web/ src/lib/agent/tools/__tests__/
```

Expected: all tests PASS.

- [ ] **Step 2: Run full test suite**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npx vitest run
```

Expected: no regressions in existing tests.

- [ ] **Step 3: Run production build**

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit any fixes if needed**

If tests or build revealed issues, fix them and commit:

```bash
cd /Users/torrinkay/Agent/BitBit/personal-assistant
git add -A
git commit -m "fix: resolve test/build issues from web harness integration"
```
