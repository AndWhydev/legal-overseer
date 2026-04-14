import { builtInProviders } from './built-in-providers'
import type { ProviderPlugin } from './types'
import { asManifest, type ConnectorManifest } from '../connectors/manifest'
import { logger } from '../core/logger'

/**
 * Static fallback manifests for the most-used Composio-backed providers.
 * Registered during bootstrap so `registry.get('slack')` (and friends) is
 * never undefined — even when the Composio API key is missing or the
 * dynamic loader fails. The dynamic loader overwrites these with richer
 * metadata (icons, descriptions, categories) when it runs.
 */
const COMPOSIO_STATIC_FALLBACKS: ConnectorManifest[] = [
  {
    id: 'slack',
    name: 'Slack',
    description: 'Message your team on Slack',
    category: 'communication',
    auth: { method: 'oauth' },
    defaultTransport: 'composio',
    capabilities: ['pull', 'send'],
    lifecycle: 'composio',
    source: 'builtin',
    composioToolkit: 'slack',
    toolSurface: { hasNativeTools: false, composioActionPrefixes: ['SLACK_', 'slack_'] },
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Connect your docs and notes',
    category: 'productivity',
    auth: { method: 'oauth' },
    defaultTransport: 'composio',
    capabilities: ['pull'],
    lifecycle: 'composio',
    source: 'builtin',
    composioToolkit: 'notion',
    toolSurface: { hasNativeTools: false, composioActionPrefixes: ['NOTION_', 'notion_'] },
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Manage contacts and deals',
    category: 'productivity',
    auth: { method: 'oauth' },
    defaultTransport: 'composio',
    capabilities: ['pull'],
    lifecycle: 'composio',
    source: 'builtin',
    composioToolkit: 'hubspot',
    toolSurface: { hasNativeTools: false, composioActionPrefixes: ['HUBSPOT_', 'hubspot_'] },
  },
  {
    id: 'xero',
    name: 'Xero',
    description: 'Accounting and invoices',
    category: 'finance',
    auth: { method: 'oauth' },
    defaultTransport: 'composio',
    capabilities: ['pull'],
    lifecycle: 'composio',
    source: 'builtin',
    composioToolkit: 'xero',
    toolSurface: { hasNativeTools: false, composioActionPrefixes: ['XERO_', 'xero_'] },
  },
]

export class ProviderRegistry {
  private providers = new Map<string, ConnectorManifest>()

  /**
   * Register a provider. Accepts either the legacy ProviderPlugin shape
   * (automatically upgraded to a ConnectorManifest with defaults) or a
   * full ConnectorManifest — used by the Composio dynamic loader.
   */
  register(plugin: ProviderPlugin | ConnectorManifest): void {
    const manifest = 'lifecycle' in plugin && 'source' in plugin
      ? plugin as ConnectorManifest
      : asManifest(plugin)

    if (this.providers.has(manifest.id)) {
      throw new Error(`Provider "${manifest.id}" already registered`)
    }
    this.providers.set(manifest.id, manifest)
  }

  /**
   * Register a manifest, replacing any existing entry. Used by the
   * dynamic Composio loader which re-syncs from the Composio catalog.
   */
  registerManifest(manifest: ConnectorManifest): void {
    this.providers.set(manifest.id, manifest)
  }

  unregister(id: string): boolean {
    return this.providers.delete(id)
  }

  get(id: string): ConnectorManifest | undefined {
    return this.providers.get(id)
  }

  has(id: string): boolean {
    return this.providers.has(id)
  }

  list(): ConnectorManifest[] {
    return Array.from(this.providers.values())
  }

  listByCategory(category: string): ConnectorManifest[] {
    return this.list().filter(p => p.category === category)
  }

  listConnectable(): ConnectorManifest[] {
    return this.list().filter(p => !p.comingSoon)
  }

  listBySource(source: ConnectorManifest['source']): ConnectorManifest[] {
    return this.list().filter(p => p.source === source)
  }
}


const providerRegistry = new ProviderRegistry()
let providerRegistryInitialized = false
let dynamicLoadKickedOff = false

export function getProviderRegistry(): ProviderRegistry {
  if (!providerRegistryInitialized) {
    // 1. Bespoke / native providers (bridges, polled OAuth adapters).
    for (const provider of builtInProviders) {
      if (!providerRegistry.has(provider.id)) {
        providerRegistry.register(provider)
      }
    }

    // 2. Composio static fallbacks — ensure catalog + tool dispatch
    //    have entries for popular apps even when the dynamic loader
    //    is offline (no API key, Composio down, local tests, …).
    for (const manifest of COMPOSIO_STATIC_FALLBACKS) {
      if (!providerRegistry.has(manifest.id)) {
        providerRegistry.registerManifest(manifest)
      }
    }

    providerRegistryInitialized = true
  }

  // 3. Fire-and-forget dynamic Composio catalog load. Runs once per
  //    process; refreshes the fallback entries with full metadata
  //    (icons, categories, descriptions) and adds every other enabled
  //    toolkit. Intentionally not awaited so startup stays fast.
  if (!dynamicLoadKickedOff && process.env.COMPOSIO_API_KEY) {
    dynamicLoadKickedOff = true
    void import('../connectors/composio-manifest-loader')
      .then(({ loadComposioManifests }) => loadComposioManifests())
      .then((result) => {
        logger.info('[provider-registry] Composio manifests loaded', {
          loaded: result.loaded,
          cached: result.cached,
        })
      })
      .catch((err) => {
        logger.warn('[provider-registry] Composio manifest load failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }

  return providerRegistry
}

/**
 * Test-only: reset the registry singleton. Exposed so tests can
 * re-register manifests without leaking state between runs.
 */
export function _resetProviderRegistryForTest(): void {
  for (const id of Array.from(providerRegistry.list().map(p => p.id))) {
    providerRegistry.unregister(id)
  }
  providerRegistryInitialized = false
  dynamicLoadKickedOff = false
}
