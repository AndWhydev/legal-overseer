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

The browser runs in a cloud sandbox via Browserbase. Each session is isolated and automatically cleaned up.`,
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
      },
      required: ['instruction'] as string[],
    },
  },
]

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const browserToolHandlers: Record<
  string,
  (
    input: Record<string, unknown>,
    orgId: string,
    supabase: import('@supabase/supabase-js').SupabaseClient,
  ) => Promise<ToolResult>
> = {
  async spawn_browser_agent(input, orgId, supabase) {
    const instruction = input.instruction as string
    const startUrl = input.start_url as string | undefined
    const maxSteps = input.max_steps as number | undefined
    const outputSchema = input.output_schema as Record<string, unknown> | undefined

    // Validate Browserbase credentials are configured
    if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
      return {
        success: false,
        error:
          'Browser automation is not configured. BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set.',
      }
    }

    logger.info('[browser-tools] Spawning browser agent', {
      instruction: instruction.slice(0, 100),
      startUrl,
      maxSteps,
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
