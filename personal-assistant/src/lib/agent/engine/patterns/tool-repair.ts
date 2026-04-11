/**
 * Tool Call Repair Pattern
 *
 * Automatically repairs malformed tool call arguments using a secondary AI
 * call with `generateObject` and the tool's own schema, so the primary model
 * can recover from invalid parameters without failing the entire run.
 *
 * Ported from: aisdkagents-patterns/tool-api-tool-call-repair
 */

import { generateText, Output, NoSuchToolError, type Tool } from 'ai'
import { models } from '@/lib/ai'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Information captured when a tool call is repaired. */
export interface RepairInfo {
  toolCallId: string
  toolName: string
  originalInput: unknown
  error: string
  repaired: boolean
}

/** Options for the repair handler factory. */
export interface ToolRepairOptions {
  /**
   * Model used for repair inference. Defaults to `models.fast` (cheap/fast)
   * because repair prompts are highly constrained by the schema.
   */
  repairModel?: Parameters<typeof generateText>[0]['model']
  /** Optional callback invoked after a successful repair. */
  onRepair?: (info: RepairInfo) => void
}

// ---------------------------------------------------------------------------
// Repair handler
// ---------------------------------------------------------------------------

/**
 * Create an `experimental_repairToolCall` handler compatible with
 * `streamText` / `generateText` from the AI SDK.
 *
 * @example
 * ```ts
 * const result = await streamText({
 *   model: models.balanced,
 *   tools: myTools,
 *   experimental_repairToolCall: createToolCallRepairHandler(),
 * })
 * ```
 */
export function createToolCallRepairHandler(opts: ToolRepairOptions = {}) {
  const { repairModel = models.fast, onRepair } = opts

  // Map to accumulate repair info keyed by toolCallId
  const repairInfoMap = new Map<string, RepairInfo>()

  const handler = async ({
    toolCall,
    tools,
    inputSchema,
    error,
  }: {
    toolCall: { toolCallId: string; toolName: string; input: unknown }
    tools: Record<string, Tool<unknown, unknown>>
    inputSchema: (tc: { toolName: string }) => unknown
    error: Error & { isInstance?: boolean }
  }) => {
    // Do not attempt to fix unknown tool names
    if (NoSuchToolError.isInstance(error)) {
      return null
    }

    const matchedTool = tools[toolCall.toolName as keyof typeof tools]
    if (!matchedTool) {
      return null
    }

    // Use structured output to coerce args into valid schema
    const { output: repairedArgs } = await generateText({
      model: repairModel,
      output: Output.object({ schema: matchedTool.inputSchema }),
      prompt: [
        `The model tried to call the tool "${toolCall.toolName}" with the following inputs:`,
        JSON.stringify(toolCall.input, null, 2),
        'The tool accepts the following schema:',
        JSON.stringify(inputSchema(toolCall), null, 2),
        `The error was: ${error.message}`,
        'Please fix the inputs to match the schema.',
      ].join('\n'),
    })

    if (!repairedArgs) return null

    const info: RepairInfo = {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      originalInput: toolCall.input,
      error: error.message,
      repaired: true,
    }

    repairInfoMap.set(toolCall.toolCallId, info)
    onRepair?.(info)

    return {
      ...toolCall,
      input: JSON.stringify(repairedArgs),
    }
  }

  return Object.assign(handler, {
    /** Access accumulated repair info (useful for metadata / logging). */
    getRepairInfo: () => new Map(repairInfoMap),
    /** Check whether a specific tool call was repaired. */
    wasRepaired: (toolCallId: string) => repairInfoMap.has(toolCallId),
  })
}
