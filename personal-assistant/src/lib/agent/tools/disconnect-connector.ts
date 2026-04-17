/**
 * disconnect_connector — agent tool to revoke a user-linked external
 * service (Gmail, Outlook, Calendar, etc.).
 *
 * The agent has `composio_connect_app` to link new apps. This is the
 * mirror for removal, so iMessage / WhatsApp users can say "disconnect
 * my Outlook" and the agent can actually act.
 *
 * Two-step protocol:
 *   1. confirm=false → returns a preview of what would be disconnected.
 *   2. confirm=true  → performs the disconnect via ConnectorManager.
 *
 * Accepts either a UUID `connector_id` or a lowercase provider slug
 * (e.g. 'outlook', 'gmail'). Slug resolution is case-insensitive and
 * picks the most recently-synced connection for that provider in the
 * user's org.
 *
 * Never throws. All errors are returned as structured ToolResult.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createConnectorManager } from '@/lib/connectors'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

type AgentToolHandler = (
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
) => Promise<ToolResult>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ConnectionRow {
  id: string
  provider: string
  display_name: string
  last_sync_at: string | null
  status: string
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export const disconnectConnectorToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'disconnect_connector',
    description:
      'Revoke a user-linked external service (Gmail, Outlook, Calendar, etc.). ' +
      'Requires confirm=true — first call with confirm=false to preview.',
    input_schema: {
      type: 'object' as const,
      properties: {
        connector_id: {
          type: 'string',
          description:
            'Either the connection UUID or a lowercase provider slug (e.g. "outlook", "gmail").',
        },
        confirm: {
          type: 'boolean',
          description:
            'Must be true to actually disconnect. Call with false first to preview.',
        },
      },
      required: ['connector_id', 'confirm'],
    },
  },
]

// ---------------------------------------------------------------------------
// Internal: resolve connector_id (UUID or provider slug) to a row
// ---------------------------------------------------------------------------

async function resolveConnection(
  supabase: SupabaseClient,
  orgId: string,
  connectorId: string,
): Promise<
  | { ok: true; row: ConnectionRow }
  | { ok: false; error: string }
> {
  const trimmed = connectorId.trim()
  if (!trimmed) return { ok: false, error: 'connector_id is required' }

  if (UUID_RE.test(trimmed)) {
    const { data, error } = await supabase
      .from('org_connections')
      .select('id, provider, display_name, last_sync_at, status')
      .eq('org_id', orgId)
      .eq('id', trimmed)
      .maybeSingle()

    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: `No connection found with id "${trimmed}"` }
    return { ok: true, row: data as ConnectionRow }
  }

  // Provider slug — case-insensitive, pick most recently synced
  const slug = trimmed.toLowerCase()
  const { data, error } = await supabase
    .from('org_connections')
    .select('id, provider, display_name, last_sync_at, status')
    .eq('org_id', orgId)
    .ilike('provider', slug)
    .order('last_sync_at', { ascending: false, nullsFirst: false })
    .limit(1)

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: `No connection found for provider "${slug}"` }
  }
  return { ok: true, row: data[0] as ConnectionRow }
}

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

export const disconnectConnectorToolHandlers: Record<string, AgentToolHandler> = {
  async disconnect_connector(input, orgId, supabase) {
    const connectorId = input.connector_id as string | undefined
    const confirm = input.confirm as boolean | undefined

    if (!connectorId || typeof connectorId !== 'string') {
      return { success: false, error: 'connector_id is required (UUID or provider slug)' }
    }

    try {
      const resolved = await resolveConnection(supabase, orgId, connectorId)
      if (!resolved.ok) {
        return { success: false, error: resolved.error }
      }
      const row = resolved.row

      // Preview mode — no mutation
      if (confirm !== true) {
        return {
          success: true,
          data: {
            about_to_disconnect: {
              id: row.id,
              provider: row.provider,
              display_name: row.display_name,
              last_active_at: row.last_sync_at,
            },
          },
        }
      }

      // Confirmed — actually disconnect via the manager
      const manager = createConnectorManager(supabase)
      const result = await manager.disconnect(row.id, {
        hard: true,
        initiator: 'user',
        reason: 'disconnected via agent tool',
      })

      if (!result.ok) {
        logger.warn('[disconnect_connector] disconnect failed', {
          orgId,
          connectionId: row.id,
          provider: row.provider,
          reason: result.reason,
        })
        return {
          success: false,
          error: `Failed to disconnect ${row.provider}: ${result.reason}`,
        }
      }

      logger.info('[disconnect_connector] disconnected', {
        orgId,
        connectionId: row.id,
        provider: row.provider,
      })

      return {
        success: true,
        data: {
          disconnected: {
            provider: row.provider,
            id: row.id,
          },
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('[disconnect_connector] unexpected error', {
        orgId,
        connectorId,
        error: message,
      })
      return { success: false, error: message }
    }
  },
}
