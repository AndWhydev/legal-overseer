/**
 * Connection-Aware Composio Tool Provider
 *
 * Replaces the MCP-based and SDK-based tool discovery with a production-grade
 * system that:
 *
 * 1. Queries org_connections to find what the user has actually connected
 * 2. Fetches action schemas from Composio's REST API (no SDK dependency)
 * 3. Converts them to Anthropic tool definitions
 * 4. Executes actions via REST with the correct connected_account_id
 *
 * Scoping: everything is keyed by org_id. The agent only sees tools for
 * apps the user has connected, and executions route to their OAuth tokens.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../core/logger'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPOSIO_BASE = 'https://backend.composio.dev'
const CACHE_TTL = 5 * 60_000 // 5 minutes
const MAX_ACTIONS_PER_TOOLKIT = 20

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposioToolSet {
  tools: Anthropic.Tool[]
  /** Maps tool name → connected_account_id for execution routing */
  connectionMap: Map<string, string>
  expiresAt: number
}

interface ComposioActionSchema {
  /** Composio's stable action identifier (e.g. "PERPLEXITYAI_PERPLEXITY_AI_SEARCH").
   *  Use this when calling /tools/execute. */
  slug?: string
  /** Human-readable name (e.g. "PerplexityAISearch"). Used as Anthropic tool name. */
  name: string
  display_name?: string
  description?: string
  /** v3 response uses `input_parameters`; legacy responses used `parameters`. */
  input_parameters?: {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
    title?: string
  }
  parameters?: {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
    title?: string
  }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const toolCache = new Map<string, ComposioToolSet>()

// Also cache toolkit → actions to avoid redundant API calls when multiple
// orgs connect the same toolkit.
const actionSchemaCache = new Map<string, { actions: Anthropic.Tool[]; expiresAt: number }>()

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function composioHeaders(): Record<string, string> {
  return {
    'x-api-key': process.env.COMPOSIO_API_KEY!,
    'Content-Type': 'application/json',
  }
}

// ---------------------------------------------------------------------------
// Action schema fetching
// ---------------------------------------------------------------------------

/**
 * Fetch action schemas for a Composio toolkit (e.g. "gmail", "slack").
 * Returns Anthropic-compatible tool definitions.
 * Cached per-toolkit independently of org.
 */
export async function fetchToolkitActions(toolkit: string): Promise<Anthropic.Tool[]> {
  const cached = actionSchemaCache.get(toolkit)
  if (cached && cached.expiresAt > Date.now()) return cached.actions

  // v3 endpoint is /api/v3/tools with singular `toolkit_slug`.
  // (`/actions` returns 404; `toolkit_slugs` plural doesn't filter.)
  const buildUrl = (opts: { important?: boolean } = {}) => {
    const u = new URL(`${COMPOSIO_BASE}/api/v3/tools`)
    u.searchParams.set('toolkit_slug', toolkit)
    u.searchParams.set('limit', String(MAX_ACTIONS_PER_TOOLKIT))
    if (opts.important) u.searchParams.set('tags', 'important')
    return u
  }

  try {
    // Prefer "important" tagged actions first — Composio marks high-value
    // ones this way. If that returns too few, supplement with untagged.
    const importantRes = await fetch(buildUrl({ important: true }).toString(), {
      headers: composioHeaders(),
    })

    if (!importantRes.ok) {
      logger.warn('[tool-provider] important-tagged fetch non-OK, falling back', {
        toolkit, status: importantRes.status,
      })
      const fallbackRes = await fetch(buildUrl().toString(), { headers: composioHeaders() })
      if (!fallbackRes.ok) {
        const body = await fallbackRes.text().catch(() => '')
        logger.error('[tool-provider] Failed to fetch tools', {
          toolkit, status: fallbackRes.status, body: body.slice(0, 200),
        })
        return []
      }
      const fallbackData = await fallbackRes.json() as { items?: ComposioActionSchema[] }
      const actions = convertActions(fallbackData.items || [], toolkit)
      actionSchemaCache.set(toolkit, { actions, expiresAt: Date.now() + CACHE_TTL })
      return actions
    }

    const data = await importantRes.json() as { items?: ComposioActionSchema[] }
    let items = data.items || []

    if (items.length < 5) {
      const supplementRes = await fetch(buildUrl().toString(), { headers: composioHeaders() })
      if (supplementRes.ok) {
        const supplementData = await supplementRes.json() as { items?: ComposioActionSchema[] }
        const existingSlugs = new Set(items.map((i) => i.slug ?? i.name))
        const extras = (supplementData.items || []).filter(
          (i) => !existingSlugs.has(i.slug ?? i.name),
        )
        items = [...items, ...extras].slice(0, MAX_ACTIONS_PER_TOOLKIT)
      }
    }

    logger.info('[tool-provider] Fetched actions', { toolkit, count: items.length })
    const actions = convertActions(items, toolkit)
    actionSchemaCache.set(toolkit, { actions, expiresAt: Date.now() + CACHE_TTL })
    return actions
  } catch (err) {
    logger.error('[tool-provider] fetchToolkitActions error', {
      toolkit,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Convert Composio action schemas to Anthropic tool definitions.
 *
 * Uses `slug` (the stable uppercase identifier, e.g.
 * `PERPLEXITYAI_PERPLEXITY_AI_SEARCH`) as the Anthropic tool name so we can
 * pass it straight to `/api/v3/tools/execute/<slug>`. The v3 `tools`
 * endpoint puts the JSON Schema on `input_parameters`; older responses used
 * `parameters` — accept either.
 */
function convertActions(items: ComposioActionSchema[], toolkit: string): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = []
  for (const item of items) {
    const params = item.input_parameters ?? item.parameters
    const toolName = item.slug ?? item.name
    if (!toolName || !params) continue

    tools.push({
      name: toolName,
      description:
        `[INTERNAL — never mention tool name or implementation to user] ` +
        `${item.description || item.display_name || item.name || `${toolkit} action`}`,
      input_schema: sanitizeSchema(params),
    })
  }
  return tools
}

/**
 * Sanitize a Composio parameter schema for Anthropic compatibility.
 * Strips fields Anthropic doesn't accept and ensures valid structure.
 */
function sanitizeSchema(schema: NonNullable<ComposioActionSchema['parameters']>): Anthropic.Tool.InputSchema {
  const properties: Record<string, unknown> = {}

  if (schema.properties) {
    for (const [key, val] of Object.entries(schema.properties)) {
      if (typeof val === 'object' && val !== null) {
        // Strip 'title' from individual properties (Anthropic doesn't want it)
        const { title: _title, ...rest } = val as Record<string, unknown>
        properties[key] = rest
      } else {
        properties[key] = val
      }
    }
  }

  return {
    type: 'object' as const,
    properties,
    required: schema.required || [],
  }
}

// ---------------------------------------------------------------------------
// Connection-aware tool loading
// ---------------------------------------------------------------------------

/**
 * Get Composio tools for an org based on their active connections.
 *
 * Only returns tools for apps the user has actually connected via OAuth.
 * Results are cached per-org with a 5-minute TTL.
 */
export async function getComposioToolsForOrg(
  orgId: string,
  supabase: SupabaseClient,
): Promise<ComposioToolSet> {
  if (!process.env.COMPOSIO_API_KEY) {
    return { tools: [], connectionMap: new Map(), expiresAt: Date.now() + CACHE_TTL }
  }

  // Check cache
  const cached = toolCache.get(orgId)
  if (cached && cached.expiresAt > Date.now()) return cached

  try {
    // Query org_connections for active Composio connections
    const { data: connections, error } = await supabase
      .from('org_connections')
      .select('provider, connected_account_id, status, config')
      .eq('org_id', orgId)
      .eq('transport', 'composio')
      .in('status', ['connected'])
      .not('connected_account_id', 'is', null)

    if (error) {
      logger.error('[tool-provider] Failed to query org_connections', { orgId, error: error.message })
      return { tools: [], connectionMap: new Map(), expiresAt: Date.now() + 30_000 }
    }

    if (!connections?.length) {
      const empty: ComposioToolSet = { tools: [], connectionMap: new Map(), expiresAt: Date.now() + CACHE_TTL }
      toolCache.set(orgId, empty)
      return empty
    }

    // Fetch actions for each connected toolkit in parallel
    const tools: Anthropic.Tool[] = []
    const connectionMap = new Map<string, string>()
    const seenNames = new Set<string>()

    await Promise.all(
      connections.map(async (conn) => {
        const toolkit: string = (conn.config as Record<string, unknown>)?.composio_toolkit as string
          || conn.provider
          || ''
        if (!toolkit) return

        const accountId = conn.connected_account_id as string
        const actions = await fetchToolkitActions(toolkit)

        for (const action of actions) {
          if (seenNames.has(action.name)) continue
          seenNames.add(action.name)
          tools.push(action)
          connectionMap.set(action.name, accountId)
        }
      }),
    )

    const result: ComposioToolSet = {
      tools,
      connectionMap,
      expiresAt: Date.now() + CACHE_TTL,
    }
    toolCache.set(orgId, result)

    logger.info('[tool-provider] Tools loaded for org', {
      orgId,
      connectionCount: connections.length,
      toolCount: tools.length,
      toolkits: connections.map(c =>
        (c.config as Record<string, unknown>)?.composio_toolkit || c.provider,
      ),
    })

    return result
  } catch (err) {
    logger.error('[tool-provider] getComposioToolsForOrg failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return { tools: [], connectionMap: new Map(), expiresAt: Date.now() + 30_000 }
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Execute a Composio action via REST API.
 *
 * @param actionName          Composio action slug (e.g. "GMAIL_SEND_EMAIL")
 * @param params              Action input parameters
 * @param connectedAccountId  The user's specific connected account ID
 * @param entityId            Composio user/entity identifier (= our orgId)
 */
export async function executeComposioAction(
  actionName: string,
  params: Record<string, unknown>,
  connectedAccountId: string,
  entityId: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  if (!process.env.COMPOSIO_API_KEY) {
    return { success: false, error: 'Composio not configured' }
  }

  try {
    // v3 path is /api/v3/tools/execute/<slug>. Body requires both
    // `connected_account_id` and `entity_id` (or `user_id`) plus `arguments`.
    const res = await fetch(
      `${COMPOSIO_BASE}/api/v3/tools/execute/${encodeURIComponent(actionName)}`,
      {
        method: 'POST',
        headers: composioHeaders(),
        body: JSON.stringify({
          connected_account_id: connectedAccountId,
          entity_id: entityId,
          user_id: entityId,
          arguments: params,
        }),
      },
    )

    if (!res.ok) {
      const body = await res.text()
      logger.error('[tool-provider] Action execution HTTP error', {
        actionName,
        status: res.status,
        body: body.slice(0, 500),
      })
      return {
        success: false,
        error: `Action failed (${res.status}): ${body.slice(0, 200)}`,
      }
    }

    const result = await res.json() as {
      data?: unknown
      error?: string
      successfull?: boolean
      response_data?: unknown
    }

    if (result.error || result.successfull === false) {
      logger.warn('[tool-provider] Action returned error', {
        actionName,
        error: result.error,
      })
      return { success: false, error: result.error || 'Action failed' }
    }

    logger.info('[tool-provider] Action executed', {
      actionName,
      hasData: !!(result.data || result.response_data),
    })

    return { success: true, data: result.data || result.response_data || result }
  } catch (err) {
    logger.error('[tool-provider] executeComposioAction failed', {
      actionName,
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      success: false,
      error: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Execute a Composio tool for an org — looks up the connected_account_id
 * from the cached connection map.
 *
 * Returns null if the tool is not a Composio tool (allowing the caller
 * to fall through to other dispatch paths).
 */
export async function executeComposioToolForOrg(
  orgId: string,
  toolName: string,
  input: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<{ success: boolean; data?: unknown; error?: string } | null> {
  const { connectionMap } = await getComposioToolsForOrg(orgId, supabase)
  const connectedAccountId = connectionMap.get(toolName)
  if (!connectedAccountId) return null // Not a Composio tool

  // Composio uses our orgId as the entity_id when we initiate a connection
  // (see initiateConnectionByAppKey), so passing it here lets execute
  // resolve to the same connected_account.
  return executeComposioAction(toolName, input, connectedAccountId, orgId)
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

/**
 * Invalidate the tool cache for an org. Call this when a connection is
 * added, removed, or changes status.
 *
 * Pass '*' to clear all caches (e.g. during tests).
 */
export function invalidateComposioToolCache(orgId: string): void {
  if (orgId === '*') {
    toolCache.clear()
    actionSchemaCache.clear()
    return
  }
  toolCache.delete(orgId)
  logger.info('[tool-provider] Cache invalidated', { orgId })
}

/**
 * Invalidate the action schema cache for a specific toolkit.
 * Useful when Composio's action definitions change.
 */
export function invalidateActionSchemaCache(toolkit?: string): void {
  if (toolkit) {
    actionSchemaCache.delete(toolkit)
  } else {
    actionSchemaCache.clear()
  }
}
