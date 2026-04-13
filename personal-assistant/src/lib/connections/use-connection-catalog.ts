'use client'

/**
 * React hook: fetches the live Composio app catalog from
 * `/api/connections/catalog` and exposes typed results for the UI.
 *
 * Built on SWR (already a dependency in this repo — see package.json
 * `"swr": "^2.4.1"`). The hook deliberately does NOT use @tanstack/react-query
 * because BitBit has no QueryClientProvider; every other data-loading hook in
 * the dashboard uses SWR.
 *
 * Behaviour contract (phase 03 / grid-rewrite consumes this):
 *   - `data.apps`          — array of CatalogApp, possibly empty
 *   - `data.error`         — present (200-OK) when Composio is not configured;
 *                            UI should surface it as a soft warning, not a
 *                            failure
 *   - `isLoading`          — true on initial mount; false on subsequent
 *                            revalidations (use `isValidating` from SWR
 *                            directly if you need that)
 *   - `error`              — populated on HTTP error (!res.ok). 401 is
 *                            re-thrown immediately WITHOUT retry so a
 *                            page-level effect can redirect to sign-in
 *   - `refetch`            — bound to SWR's `mutate`; call with no args to
 *                            force revalidation (e.g. after OAuth completes)
 */

import useSWR from 'swr'
import type { CatalogResponse } from './catalog-types'

export interface UseConnectionCatalogOptions {
  /** Free-text search, forwarded as `?q=...` to the API. */
  q?: string
  /** Category filter, forwarded as `?category=...` to the API. */
  category?: string
}

export interface UseConnectionCatalogResult {
  data: CatalogResponse | undefined
  isLoading: boolean
  error: Error | undefined
  refetch: () => Promise<CatalogResponse | undefined>
}

/** Class used so tests can match on `err instanceof CatalogHttpError`. */
export class CatalogHttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'CatalogHttpError'
    this.status = status
  }
}

/**
 * Build the request URL with optional query params. Exported for unit tests
 * (verifies the hook forwards `q` / `category` correctly).
 */
export function buildCatalogUrl(opts: UseConnectionCatalogOptions = {}): string {
  const params = new URLSearchParams()
  if (opts.q && opts.q.length > 0) params.set('q', opts.q)
  if (opts.category && opts.category.length > 0) params.set('category', opts.category)
  const qs = params.toString()
  return qs.length > 0 ? `/api/connections/catalog?${qs}` : '/api/connections/catalog'
}

/**
 * SWR fetcher. Exported for tests; not meant for direct UI consumption.
 * - Throws `CatalogHttpError` on non-2xx
 * - Returns the parsed JSON (including any `error` field) on 2xx
 */
export async function catalogFetcher(url: string): Promise<CatalogResponse> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    // Try to extract server error message; ignore parse failures.
    let msg = `Catalog request failed: ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) msg = body.error
    } catch {
      /* ignore */
    }
    throw new CatalogHttpError(res.status, msg)
  }
  return (await res.json()) as CatalogResponse
}

export function useConnectionCatalog(
  options: UseConnectionCatalogOptions = {},
): UseConnectionCatalogResult {
  const { q, category } = options

  // Stable tuple cache key so options with different order still hit the same
  // cache entry, and so an unused param doesn't fragment the cache.
  const key = ['connection-catalog', q ?? '', category ?? ''] as const

  const { data, error, isLoading, mutate } = useSWR<CatalogResponse, Error>(
    key,
    () => catalogFetcher(buildCatalogUrl({ q, category })),
    {
      revalidateOnFocus: true,
      dedupingInterval: 30_000,
      shouldRetryOnError: err => {
        // Never retry auth failures; let the page-level redirect handle it.
        if (err instanceof CatalogHttpError && err.status === 401) return false
        return true
      },
    },
  )

  return {
    data,
    isLoading,
    error,
    refetch: () => mutate(),
  }
}
