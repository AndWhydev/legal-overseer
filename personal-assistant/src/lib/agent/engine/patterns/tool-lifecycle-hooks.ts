/**
 * Tool Input Lifecycle Hooks Pattern
 *
 * Attaches pre/post hooks to any AI SDK tool so you can observe (or mutate)
 * tool-call arguments at each stage of their lifecycle:
 *   1. onInputStart  – model begins generating arguments
 *   2. onInputDelta  – streaming chunk of argument text
 *   3. onInputAvailable – complete parsed arguments ready
 *
 * Useful for real-time UX updates, logging, or server-side telemetry.
 *
 * Ported from: aisdkagents-patterns/tool-api-input-lifecycle-hooks
 */

import { type Tool, tool } from 'ai'
import type { z } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolLifecycleCallbacks<TInput = unknown> {
  /** Called when the model starts generating tool input. */
  onInputStart?: () => void
  /** Called on each streaming delta of the raw argument text. */
  onInputDelta?: (delta: { inputTextDelta: string }) => void
  /** Called once the complete, parsed input is available. */
  onInputAvailable?: (payload: { input: TInput }) => void
}

export interface ToolWithHooksOptions<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TOutput,
> {
  /** Tool name (key in the tools record). */
  name: string
  /** Description surfaced to the LLM. */
  description: string
  /** Zod schema for the tool parameters. */
  inputSchema: TSchema
  /** The actual tool execute function. */
  execute: (input: z.infer<TSchema>, extra: { experimental_context: unknown }) => Promise<TOutput>
  /** Lifecycle hook callbacks. */
  hooks: ToolLifecycleCallbacks<z.infer<TSchema>>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Wrap any tool definition with lifecycle hooks.
 *
 * @example
 * ```ts
 * const tools = createToolWithHooks({
 *   name: 'search',
 *   description: 'Search the knowledge base',
 *   inputSchema: z.object({ query: z.string() }),
 *   execute: async ({ query }) => searchKB(query),
 *   hooks: {
 *     onInputStart: () => console.log('Generating args…'),
 *     onInputDelta: ({ inputTextDelta }) => process.stdout.write(inputTextDelta),
 *     onInputAvailable: ({ input }) => console.log('Final args:', input),
 *   },
 * })
 * ```
 */
export function createToolWithHooks<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TOutput,
>(opts: ToolWithHooksOptions<TSchema, TOutput>): Record<string, Tool> {
  return {
    [opts.name]: tool({
      description: opts.description,
      inputSchema: opts.inputSchema as any,
      execute: opts.execute as any,
      // AI SDK lifecycle hooks — passed through directly
      onInputStart: opts.hooks.onInputStart as any,
      onInputDelta: opts.hooks.onInputDelta as any,
      onInputAvailable: opts.hooks.onInputAvailable as any,
    } as any),
  }
}

// ---------------------------------------------------------------------------
// Convenience: attach hooks to an existing tools record
// ---------------------------------------------------------------------------

/**
 * Create a logging-hook preset that writes to the supplied logger.
 * Handy for adding observability to tools you didn't define.
 */
export function createLoggingHooks(
  log: (msg: string, ...args: unknown[]) => void = console.log,
): ToolLifecycleCallbacks {
  return {
    onInputStart: () => log('[tool-hooks] input generation started'),
    onInputDelta: ({ inputTextDelta }) => log('[tool-hooks] delta:', inputTextDelta),
    onInputAvailable: ({ input }) => log('[tool-hooks] input complete:', input),
  }
}