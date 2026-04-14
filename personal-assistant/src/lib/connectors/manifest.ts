/**
 * ConnectorManifest — extends the existing ProviderPlugin with lifecycle
 * routing info so the ConnectorManager knows which implementation to
 * dispatch to.
 *
 * Most of the legacy ProviderPlugin shape is preserved so the catalog
 * UI and existing channel adapters continue to work. The manager uses
 * `lifecycle` (which is the TransportType) to route.
 */
import type { ProviderPlugin, TransportType } from '../connections/types'

export type ManifestSource = 'builtin' | 'composio' | 'custom'

export interface ToolSurface {
  /** Does this provider ship native tool handlers in src/lib/agent/tools? */
  hasNativeTools: boolean
  /** Composio tool-name prefix (e.g. 'gmail_') for name-based dispatch. */
  composioActionPrefixes?: string[]
}

export interface ConnectorManifest extends ProviderPlugin {
  /** Which ConnectorLifecycle implementation to dispatch to. */
  lifecycle: TransportType
  /** Where this manifest came from — powers debugging + catalog filters. */
  source: ManifestSource
  /** Composio toolkit slug if `lifecycle === 'composio'`. */
  composioToolkit?: string
  /** Tool surface for the UnifiedToolCatalog. */
  toolSurface?: ToolSurface
}

/**
 * Narrow a ProviderPlugin into a ConnectorManifest with sensible defaults.
 * Used during registry init for the old built-in array that pre-dates
 * the manifest type.
 */
export function asManifest(
  plugin: ProviderPlugin,
  overrides?: Partial<ConnectorManifest>,
): ConnectorManifest {
  return {
    ...plugin,
    lifecycle: overrides?.lifecycle ?? plugin.defaultTransport,
    source: overrides?.source ?? 'builtin',
    composioToolkit: overrides?.composioToolkit,
    toolSurface: overrides?.toolSurface ?? {
      hasNativeTools: plugin.defaultTransport !== 'composio',
    },
  }
}
