import { builtInProviders } from './built-in-providers'
import type { ProviderPlugin } from './types'
import { asManifest, type ConnectorManifest } from '../connectors/manifest'

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

export function getProviderRegistry(): ProviderRegistry {
  if (!providerRegistryInitialized) {
    for (const provider of builtInProviders) {
      if (!providerRegistry.has(provider.id)) {
        providerRegistry.register(provider)
      }
    }
    providerRegistryInitialized = true
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
}
