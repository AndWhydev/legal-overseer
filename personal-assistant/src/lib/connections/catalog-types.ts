/**
 * Types for the Composio app catalog consumed by `/api/connections/catalog`.
 *
 * These mirror the response shape produced by
 * `src/app/api/connections/catalog/route.ts`. Keep them in sync with that file.
 */

export interface CatalogApp {
  /** Composio app key, lowercase (e.g. `'gmail'`, `'slack'`). */
  id: string
  /** Human-readable app name. */
  name: string
  /** Marketing description. May be empty. */
  description: string
  /** Category tags (e.g. `['communication']`). */
  categories: string[]
  /** Composio CDN logo URL. May be empty. */
  logo: string
  /** Primary auth scheme (e.g. `'oauth2'`, `'api_key'`). */
  authScheme: string
  /** Whether the org has an ACTIVE ConnectedAccount for this app. */
  connected: boolean
}

/**
 * Shape returned by `GET /api/connections/catalog`.
 *
 * NOTE: When Composio is not configured, the route still returns HTTP 200
 * with `{ error: '...', apps: [] }` (see route.ts lines 28-33, 40-42). The
 * `useConnectionCatalog` hook surfaces this as a success state with an
 * explanatory `error` string rather than throwing, so callers can render a
 * friendly message without triggering an error boundary.
 */
export interface CatalogResponse {
  apps: CatalogApp[]
  total: number
  connected_count: number
  /** Present on 200-OK responses when Composio is unavailable/unconfigured. */
  error?: string
}
