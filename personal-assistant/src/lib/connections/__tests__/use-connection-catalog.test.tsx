// @vitest-environment jsdom
/**
 * Unit tests for `useConnectionCatalog`.
 *
 * We stub `globalThis.fetch` directly rather than use MSW: this is a
 * purely-client hook, and the rest of the repo uses `vi.stubGlobal('fetch',
 * ...)` for equivalent unit tests (see `use-voice-playback.test.ts`). The
 * repo's MSW helper in `test/msw/gateway-handler.ts` is AI-gateway-specific
 * and not applicable here.
 *
 * Each test wraps the hook in a fresh <SWRConfig provider={new Map()}> to
 * ensure full cache isolation between cases.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'

import {
  useConnectionCatalog,
  buildCatalogUrl,
  catalogFetcher,
  CatalogHttpError,
} from '../use-connection-catalog'
import type { CatalogApp, CatalogResponse } from '../catalog-types'

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function makeApp(overrides: Partial<CatalogApp> = {}): CatalogApp {
  return {
    id: 'gmail',
    name: 'Gmail',
    description: 'Email by Google',
    categories: ['communication'],
    logo: 'https://composio/logo.png',
    authScheme: 'oauth2',
    connected: false,
    ...overrides,
  }
}

function makeResponse(apps: CatalogApp[], error?: string): CatalogResponse {
  const base: CatalogResponse = {
    apps,
    total: apps.length,
    connected_count: apps.filter(a => a.connected).length,
  }
  if (error !== undefined) base.error = error
  return base
}

function wrapper({ children }: { children: React.ReactNode }) {
  // Fresh Map per render — total cache isolation between tests.
  return <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
}

// A capturing fetch mock — records URLs it's been called with.
interface FetchCall {
  url: string
  init: RequestInit | undefined
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Partial<Response> & { json: () => Promise<unknown> },
): FetchCall[] {
  const calls: FetchCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      calls.push({ url, init })
      const res = handler(url, init)
      return {
        ok: res.ok ?? true,
        status: res.status ?? 200,
        json: res.json,
      } as unknown as Response
    }),
  )
  return calls
}

// ────────────────────────────────────────────────────────────────────
// buildCatalogUrl — pure unit
// ────────────────────────────────────────────────────────────────────

describe('buildCatalogUrl', () => {
  it('returns the bare path when no options are given', () => {
    expect(buildCatalogUrl()).toBe('/api/connections/catalog')
    expect(buildCatalogUrl({})).toBe('/api/connections/catalog')
  })

  it('omits empty string params', () => {
    expect(buildCatalogUrl({ q: '', category: '' })).toBe('/api/connections/catalog')
  })

  it('forwards q', () => {
    expect(buildCatalogUrl({ q: 'gmail' })).toBe('/api/connections/catalog?q=gmail')
  })

  it('forwards category', () => {
    expect(buildCatalogUrl({ category: 'communication' })).toBe(
      '/api/connections/catalog?category=communication',
    )
  })

  it('url-encodes values', () => {
    expect(buildCatalogUrl({ q: 'hello world' })).toBe(
      '/api/connections/catalog?q=hello+world',
    )
  })

  it('forwards both params', () => {
    const url = buildCatalogUrl({ q: 'slack', category: 'communication' })
    expect(url).toBe('/api/connections/catalog?q=slack&category=communication')
  })
})

// ────────────────────────────────────────────────────────────────────
// catalogFetcher — pure unit
// ────────────────────────────────────────────────────────────────────

describe('catalogFetcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses and returns a 2xx JSON body', async () => {
    stubFetch(() => ({
      ok: true,
      status: 200,
      json: async () => makeResponse([makeApp()]),
    }))

    const body = await catalogFetcher('/api/connections/catalog')
    expect(body.total).toBe(1)
    expect(body.apps[0].id).toBe('gmail')
  })

  it('throws CatalogHttpError with status on non-2xx', async () => {
    stubFetch(() => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    }))

    await expect(catalogFetcher('/api/connections/catalog')).rejects.toMatchObject({
      name: 'CatalogHttpError',
      status: 500,
      message: 'boom',
    })
  })

  it('throws CatalogHttpError with 401 status on Unauthorized', async () => {
    stubFetch(() => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    }))

    await expect(catalogFetcher('/api/connections/catalog')).rejects.toBeInstanceOf(
      CatalogHttpError,
    )
  })
})

// ────────────────────────────────────────────────────────────────────
// useConnectionCatalog — via renderHook
// ────────────────────────────────────────────────────────────────────

describe('useConnectionCatalog', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a populated catalog on success', async () => {
    stubFetch(() => ({
      ok: true,
      status: 200,
      json: async () =>
        makeResponse([makeApp(), makeApp({ id: 'slack', name: 'Slack', connected: true })]),
    }))

    const { result } = renderHook(() => useConnectionCatalog(), { wrapper })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeUndefined()
    expect(result.current.data?.total).toBe(2)
    expect(result.current.data?.connected_count).toBe(1)
    expect(result.current.data?.apps).toHaveLength(2)
    expect(typeof result.current.refetch).toBe('function')
  })

  it('treats 200-OK { error, apps: [] } (Composio unconfigured) as success', async () => {
    // Route returns HTTP 200 with an error field when Composio is not
    // configured — the hook MUST surface this as data, not as an error.
    stubFetch(() => ({
      ok: true,
      status: 200,
      json: async () => makeResponse([], 'Composio not configured'),
    }))

    const { result } = renderHook(() => useConnectionCatalog(), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.error).toBeUndefined()
    expect(result.current.data?.apps).toEqual([])
    expect(result.current.data?.total).toBe(0)
    expect(result.current.data?.error).toBe('Composio not configured')
  })

  it('populates `error` on HTTP failure', async () => {
    stubFetch(() => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed to fetch catalog' }),
    }))

    const { result } = renderHook(() => useConnectionCatalog(), { wrapper })

    await waitFor(() => expect(result.current.error).toBeDefined())

    expect(result.current.error).toBeInstanceOf(CatalogHttpError)
    expect((result.current.error as CatalogHttpError).status).toBe(500)
    expect(result.current.data).toBeUndefined()
  })

  it('forwards the search query to the API via ?q=', async () => {
    const calls = stubFetch(() => ({
      ok: true,
      status: 200,
      json: async () => makeResponse([]),
    }))

    const { result } = renderHook(() => useConnectionCatalog({ q: 'gmail' }), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/connections/catalog?q=gmail')
  })

  it('forwards the category filter to the API via ?category=', async () => {
    const calls = stubFetch(() => ({
      ok: true,
      status: 200,
      json: async () => makeResponse([]),
    }))

    const { result } = renderHook(
      () => useConnectionCatalog({ category: 'communication' }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/connections/catalog?category=communication')
  })
})
