/**
 * @file Public surface for the ConnectorLifecycle system.
 *
 * Callers (API routes, crons, UI actions) should almost always use the
 * `getConnectorManager()` factory rather than instantiating lifecycles
 * themselves. The factory wires the Composio / Bridge / Poll / Webhook
 * lifecycles against the Supabase service client.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { createProvisioner, createImessageProvisioner } from '../bridges'
import { ConnectorManager } from './manager'
import { BridgeLifecycle } from './lifecycles/bridge'
import { ComposioLifecycle } from './lifecycles/composio'
import { PollLifecycle } from './lifecycles/poll'
import { WebhookLifecycle } from './lifecycles/webhook'

// ─── Exports ─────────────────────────────────────────────────────────────────
export { ConnectorManager } from './manager'
export { ConnectionHealthReporter } from './health-reporter'
export { BridgeLifecycle } from './lifecycles/bridge'
export { ComposioLifecycle } from './lifecycles/composio'
export { PollLifecycle } from './lifecycles/poll'
export { WebhookLifecycle } from './lifecycles/webhook'
export type {
  ConnectorLifecycle,
  ProvisionInput,
  ProvisionResult,
  RefreshResult,
  DisconnectOptions,
  HealthReport,
  SuspendReason,
  ActivateContext,
} from './lifecycle'
export type { ConnectorManifest, ManifestSource, ToolSurface } from './manifest'
export { asManifest } from './manifest'

// ─── Factory ─────────────────────────────────────────────────────────────────

export interface CreateManagerOptions {
  /** When true, skip constructing bridge lifecycle (useful in edge/test). */
  skipBridge?: boolean
}

export function createConnectorManager(
  supabase: SupabaseClient,
  opts: CreateManagerOptions = {},
): ConnectorManager {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bitbit.chat'

  const lifecycles: import('./manager').ConnectorManagerDeps['lifecycles'] = {
    composio: new ComposioLifecycle({ supabase, appUrl }),
    poll: new PollLifecycle({ supabase }),
    webhook: new WebhookLifecycle({ supabase }),
  }

  if (!opts.skipBridge) {
    try {
      const bridgeProvisioner = createProvisioner(supabase)
      let macVpsProvisioner
      try {
        macVpsProvisioner = createImessageProvisioner(supabase)
      } catch {
        // iMessage provisioner is optional.
      }
      lifecycles.bridge = new BridgeLifecycle({
        supabase,
        bridgeProvisioner,
        macVpsProvisioner,
      })
    } catch {
      // No Fly client available (likely missing FLY_API_TOKEN in this env) —
      // bridge disconnect/health will be unavailable but the manager still works.
    }
  }

  return new ConnectorManager({ supabase, lifecycles })
}
