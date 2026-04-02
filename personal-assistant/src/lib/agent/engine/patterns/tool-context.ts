/**
 * Tool Context Pattern
 *
 * Injects tenant/user context into tool calls via `experimental_context`.
 * Tools receive ambient state (user preferences, API keys, tenant config)
 * without needing it passed as explicit tool parameters.
 *
 * Ported from: aisdkagents-patterns/tool-api-context
 */

import { type Tool, tool } from 'ai'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Arbitrary key-value context injected into every tool call. */
export interface ToolContext {
  /** Tenant or workspace identifier. */
  tenantId?: string
  /** Authenticated user id. */
  userId?: string
  /** User-level preferences (units, locale, timezone, etc.). */
  preferences?: Record<string, unknown>
  /** Downstream API keys the tool may need. */
  apiKeys?: Record<string, string>
  /** Catch-all for ad-hoc context values. */
  [key: string]: unknown
}

/** Metadata about which context keys a tool actually consumed. */
export interface ContextUsageReport {
  /** Keys that were read during tool execution. */
  keysUsed: string[]
  /** The full context snapshot (useful for debugging). */
  contextSnapshot: ToolContext
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a typed `ToolContext` from the raw `experimental_context` value
 * that the AI SDK passes into `execute`.
 */
export function extractContext(rawContext: unknown): ToolContext {
  if (rawContext && typeof rawContext === 'object') {
    return rawContext as ToolContext
  }
  return {}
}

/**
 * Track which context keys are present and return a usage report.
 */
export function reportContextUsage(ctx: ToolContext): ContextUsageReport {
  const keysUsed = Object.keys(ctx).filter((k) => ctx[k] !== undefined)
  return { keysUsed, contextSnapshot: ctx }
}

// ---------------------------------------------------------------------------
// Context-aware tool factory
// ---------------------------------------------------------------------------

export interface ContextAwareToolOptions<TInput extends z.ZodObject<z.ZodRawShape>, TOutput> {
  /** Tool name (used as the key in the tools record). */
  name: string
  /** Human-readable description for the LLM. */
  description: string
  /** Zod schema for tool input parameters. */
  inputSchema: TInput
  /**
   * Execute function that receives both parsed input AND the tenant context.
   * Return your tool result; context usage tracking is handled automatically.
   */
  execute: (
    input: z.infer<TInput>,
    context: ToolContext,
  ) => Promise<TOutput>
}

/**
 * Create a tool that automatically extracts and forwards `ToolContext` from
 * the AI SDK's `experimental_context`.
 *
 * @example
 * ```ts
 * const tools = createContextAwareTool({
 *   name: 'lookupClient',
 *   description: 'Look up a client by name',
 *   inputSchema: z.object({ name: z.string() }),
 *   execute: async ({ name }, ctx) => {
 *     const tenantId = ctx.tenantId ?? 'default'
 *     return db.clients.find({ tenantId, name })
 *   },
 * })
 * ```
 */
export function createContextAwareTool<TInput extends z.ZodObject<z.ZodRawShape>, TOutput>(
  opts: ContextAwareToolOptions<TInput, TOutput>,
): Record<string, Tool<z.infer<TInput>, TOutput & { _contextUsage: ContextUsageReport }>> {
  return {
    [opts.name]: tool({
      description: opts.description,
      inputSchema: opts.inputSchema,
      execute: async (
        input: z.infer<TInput>,
        { experimental_context: rawContext }: { experimental_context: unknown },
      ): Promise<TOutput & { _contextUsage: ContextUsageReport }> => {
        const ctx = extractContext(rawContext)
        const result = await opts.execute(input, ctx)
        const usage = reportContextUsage(ctx)
        return { ...result, _contextUsage: usage } as TOutput & { _contextUsage: ContextUsageReport }
      },
    }),
  } as Record<string, Tool<z.infer<TInput>, TOutput & { _contextUsage: ContextUsageReport }>>
}