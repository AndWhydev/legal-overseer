import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getComposioClient, isComposioEnabled, listConnectedAccounts } from '@/lib/composio'
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

// ---------------------------------------------------------------------------
// Tool Definitions (Anthropic tool_use format)
// ---------------------------------------------------------------------------

export const composioToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'composio_list_apps',
    description:
      '[INTERNAL — never mention tool name or implementation to user] ' +
      'Check which third-party apps the user has connected. ' +
      'Use silently to understand what integrations are available before acting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filter_status: {
          type: 'string',
          enum: ['ACTIVE', 'EXPIRED', 'ALL'],
          description: 'Filter by connection status. Default: ACTIVE',
        },
      },
      required: [],
    },
  },
  {
    name: 'composio_list_actions',
    description:
      '[INTERNAL — never mention tool name or implementation to user] ' +
      'Discover what actions are available for a connected app. ' +
      'Call silently to find the right action before executing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        app: {
          type: 'string',
          description: 'App name (e.g., "gmail", "slack", "hubspot", "notion")',
        },
        query: {
          type: 'string',
          description: 'Optional search to filter actions (e.g., "send", "list", "create")',
        },
      },
      required: ['app'],
    },
  },
  {
    name: 'composio_execute',
    description:
      '[INTERNAL — never mention tool name or implementation to user] ' +
      'Execute an action on a connected third-party app. ' +
      'Use composio_list_actions first to find the exact action name and parameters. ' +
      'Present results naturally as if BitBit natively integrates with the app.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          description: 'Action name (e.g., "GMAIL_SEND_EMAIL", "SLACK_SEND_MESSAGE", "HUBSPOT_CREATE_CONTACT")',
        },
        params: {
          type: 'object',
          description: 'Action parameters (varies by action)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'composio_connect_app',
    description:
      '[INTERNAL — never mention tool name or implementation to user] ' +
      'Generate an authorization link so the user can connect a new app to BitBit. ' +
      'Use IMMEDIATELY when a user asks to connect an app or when you discover ' +
      'you need access to an app that isn\'t connected yet. ' +
      'Do NOT tell the user to "go to settings" or "visit the connections page" — ' +
      'generate the link and present it directly. ' +
      'Frame it as: "Here\'s a link to connect your [App] — just authorize and you\'re set."',
    input_schema: {
      type: 'object' as const,
      properties: {
        app: {
          type: 'string',
          description: 'The app to connect (e.g., "gmail", "slack", "hubspot", "jira", "notion")',
        },
        reason: {
          type: 'string',
          description: 'Brief internal note for logging (not shown to user)',
        },
      },
      required: ['app'],
    },
  },
]

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

export const composioToolHandlers: Record<string, AgentToolHandler> = {
  async composio_list_apps(input, orgId) {
    if (!isComposioEnabled()) {
      return { success: false, error: 'Composio is not configured. Set COMPOSIO_API_KEY to enable integrations.' }
    }

    try {
      const accounts = await listConnectedAccounts(orgId)

      if (accounts.length === 0) {
        return {
          success: true,
          data: {
            message: 'No apps connected yet. The user can connect apps from the Connections page in the dashboard.',
            connected_apps: [],
          },
        }
      }

      return {
        success: true,
        data: {
          connected_apps: accounts.map(a => ({
            id: a.id,
            app: a.toolkit,
            status: a.status,
          })),
          count: accounts.length,
        },
      }
    } catch (err) {
      logger.error('[composio-tools] composio_list_apps failed', {
        orgId,
        error: err instanceof Error ? err.message : String(err),
      })
      return { success: false, error: `Failed to list connected apps: ${err instanceof Error ? err.message : String(err)}` }
    }
  },

  async composio_list_actions(input, orgId) {
    const app = input.app as string
    if (!app) {
      return { success: false, error: 'The "app" parameter is required. Provide a Composio app name (e.g., "gmail", "slack").' }
    }

    if (!isComposioEnabled()) {
      return { success: false, error: 'Composio is not configured. Set COMPOSIO_API_KEY to enable integrations.' }
    }

    const composio = getComposioClient()
    if (!composio) {
      return { success: false, error: 'Composio client not available.' }
    }

    try {
      const session = await composio.create(orgId)
      const tools = await session.tools()

      // Filter tools by app name
      const appLower = app.toLowerCase()
      const matchingTools = (tools as Array<{ name?: string; description?: string; function?: { name?: string; description?: string } }>)
        .filter(t => {
          const name = (t.name || t.function?.name || '').toLowerCase()
          return name.startsWith(`${appLower}_`) || name.includes(appLower)
        })
        .map(t => ({
          name: t.name || t.function?.name || '',
          description: (t.description || t.function?.description || '').slice(0, 200),
        }))

      // Optional query filter
      const query = (input.query as string)?.toLowerCase()
      const filtered = query
        ? matchingTools.filter(t =>
            t.name.toLowerCase().includes(query) ||
            t.description.toLowerCase().includes(query)
          )
        : matchingTools

      return {
        success: true,
        data: {
          app,
          actions: filtered.slice(0, 30), // Cap at 30 to avoid context bloat
          total: filtered.length,
          hint: filtered.length > 30
            ? `Showing 30 of ${filtered.length} actions. Use the "query" parameter to narrow results.`
            : undefined,
        },
      }
    } catch (err) {
      logger.error('[composio-tools] composio_list_actions failed', {
        orgId,
        app,
        error: err instanceof Error ? err.message : String(err),
      })
      return { success: false, error: `Failed to list actions for ${app}: ${err instanceof Error ? err.message : String(err)}` }
    }
  },

  async composio_execute(input, orgId) {
    const action = input.action as string
    if (!action) {
      return { success: false, error: 'The "action" parameter is required. Use composio_list_actions to discover available action names.' }
    }

    if (!isComposioEnabled()) {
      return { success: false, error: 'Composio is not configured. Set COMPOSIO_API_KEY to enable integrations.' }
    }

    const composio = getComposioClient()
    if (!composio) {
      return { success: false, error: 'Composio client not available.' }
    }

    const params = (input.params as Record<string, unknown>) || {}

    try {
      // Execute via Composio's tools API with entity context
      const result = await (composio as unknown as {
        tools: {
          execute: (opts: {
            actionName: string
            params: Record<string, unknown>
            entityId?: string
          }) => Promise<{ data?: unknown; error?: string; successfull?: boolean }>
        }
      }).tools.execute({
        actionName: action,
        params,
        entityId: orgId,
      })

      if (result.error || result.successfull === false) {
        logger.warn('[composio-tools] composio_execute action returned error', {
          orgId,
          action,
          error: result.error,
        })
        return {
          success: false,
          error: `Action ${action} failed: ${result.error || 'Unknown error'}`,
        }
      }

      logger.info('[composio-tools] composio_execute success', {
        orgId,
        action,
        hasData: !!result.data,
      })

      return {
        success: true,
        data: result.data,
      }
    } catch (err) {
      logger.error('[composio-tools] composio_execute failed', {
        orgId,
        action,
        error: err instanceof Error ? err.message : String(err),
      })
      return {
        success: false,
        error: `Failed to execute ${action}: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },

  async composio_connect_app(input, orgId) {
    const app = input.app as string
    if (!app) {
      return { success: false, error: 'The "app" parameter is required. Specify which app to connect (e.g., "slack", "hubspot").' }
    }

    if (!isComposioEnabled()) {
      return { success: false, error: 'Composio is not configured. Set COMPOSIO_API_KEY to enable integrations.' }
    }

    const composio = getComposioClient()
    if (!composio) {
      return { success: false, error: 'Composio client not available.' }
    }

    const reason = (input.reason as string) || `Connect ${app} to BitBit`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bitbit.chat'
    const callbackUrl = `${appUrl}/api/connections/composio/callback`

    try {
      const connRequest = await (composio as unknown as {
        connectedAccounts: {
          initiate: (userId: string, appName: string, opts: { callbackUrl: string }) => Promise<{
            id: string
            redirectUrl?: string | null
          }>
        }
      }).connectedAccounts.initiate(orgId, app, { callbackUrl })

      if (!connRequest.redirectUrl) {
        return {
          success: false,
          error: `Could not generate connection URL for ${app}. The app may not be available in Composio.`,
        }
      }

      logger.info('[composio-tools] composio_connect_app generated URL', {
        orgId,
        app,
        reason,
      })

      return {
        success: true,
        data: {
          message: `To connect ${app}, the user needs to authorize access. Share this link with them:`,
          connect_url: connRequest.redirectUrl,
          reason,
          app,
          instructions: 'Send this URL to the user. After they authorize, the app will be available for use.',
        },
      }
    } catch (err) {
      logger.error('[composio-tools] composio_connect_app failed', {
        orgId,
        app,
        error: err instanceof Error ? err.message : String(err),
      })
      return {
        success: false,
        error: `Failed to initiate connection for ${app}: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
