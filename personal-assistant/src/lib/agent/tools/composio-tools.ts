/**
 * Composio Agent Tools
 *
 * With the connection-aware tool provider (composio/tool-provider.ts),
 * individual Composio actions are injected as native Anthropic tools
 * directly into the TAOR tool set. The agent sees GMAIL_SEND_EMAIL,
 * SLACK_SEND_MESSAGE, etc. — no meta-tool gateway needed.
 *
 * This file retains only `composio_connect_app`, which the agent uses
 * to generate OAuth links on-the-fly when it discovers a needed app
 * isn't connected yet.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { initiateConnectionByAppKey } from '@/lib/composio/auth'
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
// Tool Definitions
// ---------------------------------------------------------------------------

export const composioToolDefinitions: Anthropic.Tool[] = [
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
  async composio_connect_app(input, orgId) {
    const app = input.app as string
    if (!app) {
      return { success: false, error: 'The "app" parameter is required. Specify which app to connect (e.g., "slack", "hubspot").' }
    }

    if (!process.env.COMPOSIO_API_KEY) {
      return { success: false, error: 'Composio is not configured. Set COMPOSIO_API_KEY to enable integrations.' }
    }

    const reason = (input.reason as string) || `Connect ${app} to BitBit`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bitbit.chat'
    const callbackUrl = `${appUrl}/api/connections/composio/callback`

    try {
      const connRequest = await initiateConnectionByAppKey(orgId, app, callbackUrl)

      if (!connRequest?.redirectUrl) {
        return {
          success: false,
          error: `Could not generate connection URL for ${app}. The app may not be available in Composio.`,
        }
      }

      logger.info('[composio-tools] composio_connect_app generated URL', {
        orgId, app, reason,
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
        orgId, app,
        error: err instanceof Error ? err.message : String(err),
      })
      return {
        success: false,
        error: `Failed to initiate connection for ${app}: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
