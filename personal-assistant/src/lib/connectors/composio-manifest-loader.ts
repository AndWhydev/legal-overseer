/**
 * ComposioManifestLoader — discovers Composio toolkits at runtime and
 * registers them as ConnectorManifests in the ProviderRegistry.
 *
 * This replaces the hard-coded list of Composio apps in
 * src/lib/connections/built-in-providers.ts — any toolkit that has an
 * enabled auth config in Composio becomes a first-class provider that
 * the catalog UI and UnifiedToolCatalog can surface.
 *
 * The loader caches its result in-memory with a TTL so /api/connections/catalog
 * doesn't hit Composio on every request.
 */
import { logger } from '../core/logger'
import { getProviderRegistry } from '../connections/registry'
import type { Capability } from '../connections/types'
import type { ConnectorManifest } from './manifest'

const COMPOSIO_BASE = 'https://backend.composio.dev'
const DEFAULT_TTL_MS = 10 * 60 * 1000

interface ToolkitItem {
  slug: string
  name: string
  no_auth?: boolean
  meta?: {
    description?: string
    logo?: string
    categories?: Array<{ id: string; name: string }>
  }
  auth_schemes?: string[]
}

interface LoaderState {
  lastLoadedAt: number
  manifestIds: string[]
}

const state: LoaderState = { lastLoadedAt: 0, manifestIds: [] }

export interface LoadOptions {
  /** Force reload even if cache is fresh. */
  force?: boolean
  /** Override default TTL. */
  ttlMs?: number
}

export async function loadComposioManifests(opts: LoadOptions = {}): Promise<{
  loaded: number
  cached: boolean
}> {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) return { loaded: 0, cached: false }

  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS
  const fresh = Date.now() - state.lastLoadedAt < ttl
  if (fresh && !opts.force && state.manifestIds.length > 0) {
    return { loaded: state.manifestIds.length, cached: true }
  }

  const registry = getProviderRegistry()

  try {
    const res = await fetch(`${COMPOSIO_BASE}/api/v3/toolkits?limit=1000`, {
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`Composio toolkits API ${res.status}`)
    }
    const body = (await res.json()) as { items?: ToolkitItem[] }
    const toolkits = (body.items ?? []).filter((t) => !t.no_auth)

    // Remove previously-registered Composio manifests before re-registering
    // so the registry stays in sync with Composio's catalog.
    for (const id of state.manifestIds) {
      registry.unregister(id)
    }

    const newIds: string[] = []
    let skipped = 0
    for (const tk of toolkits) {
      const manifest = toolkitToManifest(tk)
      // Don't overwrite native/bespoke providers (e.g. `gmail`, `whatsapp`,
      // `asana`) if Composio returns a toolkit with a colliding slug.
      // Only manifests whose lifecycle is already `'composio'` (static
      // fallbacks registered at bootstrap) are safe to replace.
      const existing = registry.get(manifest.id)
      if (existing && existing.lifecycle !== 'composio') {
        skipped++
        logger.warn('[composio-manifest-loader] skipping toolkit — id collides with non-composio provider', {
          id: manifest.id,
          existingLifecycle: existing.lifecycle,
          existingSource: existing.source,
        })
        continue
      }
      registry.registerManifest(manifest)
      newIds.push(manifest.id)
    }

    state.manifestIds = newIds
    state.lastLoadedAt = Date.now()

    logger.info('[composio-manifest-loader] registered manifests', {
      count: newIds.length,
      skipped,
    })
    return { loaded: newIds.length, cached: false }
  } catch (err) {
    logger.error('[composio-manifest-loader] load failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { loaded: 0, cached: false }
  }
}

function toolkitToManifest(tk: ToolkitItem): ConnectorManifest {
  const description = tk.meta?.description ?? `${tk.name} (via Composio)`
  const category = inferCategory(tk.meta?.categories)
  const capabilities: Capability[] = ['pull', 'send']

  return {
    id: tk.slug,
    name: tk.name,
    description,
    category,
    auth: { method: 'oauth' },
    defaultTransport: 'composio',
    capabilities,
    icon: tk.meta?.logo,
    lifecycle: 'composio',
    source: 'composio',
    composioToolkit: tk.slug,
    toolSurface: {
      hasNativeTools: false,
      composioActionPrefixes: [`${tk.slug.toUpperCase()}_`, `${tk.slug}_`],
    },
  }
}

function inferCategory(
  raw: Array<{ id: string; name: string }> | undefined,
): ConnectorManifest['category'] {
  if (!raw || raw.length === 0) return 'custom'
  const labels = raw.map((c) => (c.name || c.id).toLowerCase())
  if (labels.some((l) => l.includes('mail') || l.includes('chat') || l.includes('messaging'))) {
    return 'communication'
  }
  if (labels.some((l) => l.includes('finance') || l.includes('payment') || l.includes('accounting'))) {
    return 'finance'
  }
  if (labels.some((l) => l.includes('task') || l.includes('productivity') || l.includes('calendar'))) {
    return 'productivity'
  }
  return 'custom'
}

/** Test-only helper to clear the cache between tests. */
export function _resetComposioManifestLoaderForTest(): void {
  state.lastLoadedAt = 0
  state.manifestIds = []
}
