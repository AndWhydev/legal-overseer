import type Anthropic from '@anthropic-ai/sdk'
import type { ToolResult } from '../tools'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const browserToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'spawn_browser_agent',
    description: `Launch a cloud browser session to perform web automation tasks. The browser agent can navigate websites, fill forms, click buttons, and extract structured data using natural language instructions.

When to use:
- Scraping data from websites that require JavaScript rendering
- Filling out forms or completing multi-step web workflows
- Extracting structured information from web pages (prices, listings, contact info)
- Interacting with web apps that don't have APIs

When NOT to use:
- Simple URL fetching (use fetch_url or web_read instead)
- API calls (use the relevant integration tool)
- Searching the web (use web_search instead)

The browser runs in a cloud sandbox via Browserbase. Each session is isolated and automatically cleaned up.

Credential injection: when a task requires signing in, set \`credential_source\` to either "composio" (for Composio-connected apps) or "1password" (for 1Password secret references). Credential values are substituted at the browser layer — the raw password is never exposed to the LLM. For any other case leave \`credential_source\` unset or "none".`,
    input_schema: {
      type: 'object' as const,
      properties: {
        instruction: {
          type: 'string',
          description:
            'Natural language description of what the browser agent should do. Be specific about the goal, target elements, and expected output. Example: "Go to example.com/pricing, find the Enterprise tier price, and extract the monthly cost."',
        },
        start_url: {
          type: 'string',
          description:
            'URL to navigate to before executing the instruction. If omitted, the agent navigates based on the instruction.',
        },
        max_steps: {
          type: 'integer',
          description:
            'Maximum number of browser actions the agent can take (default: 10). Increase for complex multi-page workflows.',
        },
        output_schema: {
          type: 'object',
          description:
            'Optional JSON schema describing the structure of data to extract. When provided, the agent will return structured data matching this schema.',
        },
        credential_source: {
          type: 'string',
          enum: ['none', 'composio', '1password'],
          description:
            'Where to retrieve login credentials from before executing the instruction. Use "composio" when the org has a Composio BASIC connection for the target app, "1password" to read from a 1Password secret reference, or omit (equivalent to "none") when no sign-in is required.',
        },
        composio_connection_id: {
          type: 'string',
          description:
            'Composio connected-account id (the connected_account_id on org_connections) to source credentials from. REQUIRED when credential_source is "composio". The connection must belong to the current org — cross-org references are rejected.',
        },
        op_secret_ref: {
          type: 'string',
          description:
            '1Password secret reference in the form "op://<vault>/<item>". Both `<ref>/username` and `<ref>/password` must resolve via the `op` CLI. REQUIRED when credential_source is "1password".',
        },
        username_selector: {
          type: 'string',
          description:
            'Optional CSS selector for the username/email field (defaults to "#email" when omitted). Use when the target page needs a non-standard selector.',
        },
        password_selector: {
          type: 'string',
          description:
            'Optional CSS selector for the password field (defaults to "#password" when omitted). Use when the target page needs a non-standard selector.',
        },
      },
      required: ['instruction'] as string[],
    },
  },
]

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type SupabaseLike = import('@supabase/supabase-js').SupabaseClient

/**
 * Verify that a Composio connected account belongs to the caller's org.
 *
 * The tool accepts a `composio_connection_id` from the LLM, so we must
 * never trust it — cross-org references would let a compromised or confused
 * agent exfiltrate credentials from another tenant. The check queries
 * `org_connections` (the canonical ownership table) filtered by
 * `org_id + connected_account_id`.
 */
async function verifyComposioConnectionOwnership(
  connectionId: string,
  orgId: string,
  supabase: SupabaseLike,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('org_connections')
    .select('id')
    .eq('org_id', orgId)
    .eq('connected_account_id', connectionId)
    .eq('transport', 'composio')
    .maybeSingle()

  if (error) {
    logger.error('[browser-tools] Ownership lookup failed', {
      orgId,
      connectionId,
      error: error.message,
    })
    return false
  }

  return Boolean(data)
}

export const browserToolHandlers: Record<
  string,
  (
    input: Record<string, unknown>,
    orgId: string,
    supabase: SupabaseLike,
  ) => Promise<ToolResult>
> = {
  async spawn_browser_agent(input, orgId, supabase) {
    const instruction = input.instruction as string
    const startUrl = input.start_url as string | undefined
    const maxSteps = input.max_steps as number | undefined
    const outputSchema = input.output_schema as Record<string, unknown> | undefined

    // Credential inputs (all optional)
    const credentialSource = (input.credential_source as
      | 'none'
      | 'composio'
      | '1password'
      | undefined) ?? 'none'
    const composioConnectionId = input.composio_connection_id as string | undefined
    const opSecretRef = input.op_secret_ref as string | undefined
    const usernameSelector = input.username_selector as string | undefined
    const passwordSelector = input.password_selector as string | undefined

    // Validate Browserbase credentials are configured
    if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
      return {
        success: false,
        error:
          'Browser automation is not configured. BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set.',
      }
    }

    // Validate credential inputs shape + verify ownership for Composio
    if (credentialSource === 'composio') {
      if (!composioConnectionId) {
        return {
          success: false,
          error:
            'credential_source="composio" requires composio_connection_id.',
        }
      }
      const owned = await verifyComposioConnectionOwnership(
        composioConnectionId,
        orgId,
        supabase,
      )
      if (!owned) {
        logger.warn('[browser-tools] Rejected cross-org Composio connection', {
          orgId,
          connectionId: composioConnectionId,
        })
        return {
          success: false,
          error:
            'Composio connection not found for this org. Check composio_connection_id.',
        }
      }
    } else if (credentialSource === '1password') {
      if (!opSecretRef) {
        return {
          success: false,
          error:
            'credential_source="1password" requires op_secret_ref.',
        }
      }
    }

    logger.info('[browser-tools] Spawning browser agent', {
      instruction: instruction.slice(0, 100),
      startUrl,
      maxSteps,
      credentialSource,
    })

    try {
      // Dynamic import to keep the SDK out of the main bundle
      const { executeBrowserTask } = await import('@/lib/browser/browser-task')

      const result = await executeBrowserTask(
        {
          instruction,
          startUrl,
          maxSteps,
          outputSchema,
        },
        {
          orgId,
          supabase,
          ltvMultiplier: (input.ltv_multiplier as number) ?? 1.0,
          credentialSource,
          credentialOptions:
            credentialSource === 'none'
              ? undefined
              : {
                  composioConnectionId,
                  opSecretRef,
                  usernameSelector,
                  passwordSelector,
                },
        },
      )

      if (result.status === 'failed') {
        return {
          success: false,
          error: result.error ?? 'Browser task failed without an error message.',
          data: {
            actions: result.actions,
            durationMs: result.durationMs,
          },
        }
      }

      return {
        success: true,
        data: {
          status: result.status,
          message: result.message,
          extractedData: result.extractedData,
          actions: result.actions,
          sessionId: result.sessionId,
          replayUrl: result.replayUrl,
          durationMs: result.durationMs,
          usage: result.usage,
        },
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('[browser-tools] spawn_browser_agent failed', { error: errorMsg })
      return { success: false, error: `Browser agent error: ${errorMsg}` }
    }
  },
}
