/**
 * Structured Output via Tool Use — converts Zod schemas into Anthropic
 * pseudo-tools that force validated JSON responses.
 *
 * Pattern:
 *   1. Define a Zod schema for the expected output shape
 *   2. createStructuredTool() converts it to an Anthropic Tool definition
 *   3. Pass tool + tool_choice to the API call to force structured output
 *   4. parseStructuredOutput() extracts and validates the tool_use block
 *
 * This avoids brittle regex/JSON.parse on free-form text and gives us
 * compile-time types + runtime validation in one shot.
 *
 * Uses Zod v4's native toJSONSchema() — no zod-to-json-schema dep needed.
 */

import { z, toJSONSchema } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A pseudo-tool definition that wraps a Zod schema for structured output.
 * Includes both the Anthropic API tool definition and the Zod schema for parsing.
 */
export interface StructuredTool<T extends z.ZodType> {
  /** The Anthropic Tool definition to pass in the `tools` array */
  tool: Anthropic.Tool
  /** tool_choice to pass to the API — forces this tool to be used */
  toolChoice: Anthropic.MessageCreateParams['tool_choice']
  /** The Zod schema for validation */
  schema: T
  /** The tool name (for matching in response) */
  name: string
}

/**
 * Result of parsing a structured output from a Claude response.
 */
export type StructuredOutputResult<T> =
  | { success: true; data: T; raw: unknown }
  | { success: false; error: string; raw: unknown }

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Create a pseudo-tool from a Zod schema that forces structured output.
 *
 * The tool name defaults to 'structured_output' but can be customized
 * when multiple structured tools are needed in the same call.
 *
 * @example
 * ```ts
 * const tool = createStructuredTool(ActionPlanSchema, {
 *   name: 'generate_plan',
 *   description: 'Generate an execution plan for the user request.',
 * })
 *
 * const response = await client.messages.create({
 *   model: 'claude-sonnet-4-20250514',
 *   tools: [tool.tool],
 *   tool_choice: tool.toolChoice,
 *   messages: [...],
 * })
 *
 * const result = parseStructuredOutput(response, tool)
 * if (result.success) {
 *   console.log(result.data) // typed ActionPlan
 * }
 * ```
 */
export function createStructuredTool<T extends z.ZodType>(
  schema: T,
  options: {
    name?: string
    description?: string
  } = {},
): StructuredTool<T> {
  const name = options.name ?? 'structured_output'
  const description = options.description ?? 'Return structured output matching the required schema.'

  // Convert Zod schema to JSON Schema via Zod v4's built-in converter
  const jsonSchema = toJSONSchema(schema) as Record<string, unknown>

  // Strip the top-level $schema key — Anthropic's API doesn't want it
  const { $schema, ...inputSchema } = jsonSchema

  // Ensure the input_schema has type: 'object' at the root
  // (Anthropic requires this for tool definitions)
  const tool: Anthropic.Tool = {
    name,
    description,
    input_schema: inputSchema as Anthropic.Tool.InputSchema,
  }

  return {
    tool,
    toolChoice: { type: 'tool', name },
    schema,
    name,
  }
}

/**
 * Parse the structured output from a Claude response.
 *
 * Finds the tool_use block matching the structured tool name,
 * extracts its input, and validates it against the Zod schema.
 *
 * Returns a discriminated union so callers can handle validation
 * failures gracefully.
 */
export function parseStructuredOutput<T extends z.ZodType>(
  response: Anthropic.Message,
  tool: StructuredTool<T>,
): StructuredOutputResult<z.infer<T>> {
  // Find the tool_use block matching our pseudo-tool name
  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === 'tool_use' && block.name === tool.name,
  )

  if (!toolUseBlock) {
    return {
      success: false,
      error: `No tool_use block found with name '${tool.name}' in response`,
      raw: response.content,
    }
  }

  const raw = toolUseBlock.input

  // Validate against the Zod schema
  const parsed = tool.schema.safeParse(raw)

  if (!parsed.success) {
    const errorMessage = parsed.error instanceof z.ZodError
      ? parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      : String(parsed.error)

    logger.warn('[structured-output] Validation failed', {
      tool: tool.name,
      error: errorMessage,
      raw,
    })

    return {
      success: false,
      error: `Schema validation failed: ${errorMessage}`,
      raw,
    }
  }

  return {
    success: true,
    data: parsed.data,
    raw,
  }
}

/**
 * Convenience: create a structured tool and return a function that
 * makes the API call and returns parsed output.
 *
 * This is the simplest way to get structured output from Claude —
 * one function call that handles everything.
 *
 * @example
 * ```ts
 * const getDecision = createStructuredCall(client, ConfidenceDecisionSchema, {
 *   name: 'confidence_decision',
 *   description: 'Decide whether to act, ask, or escalate.',
 * })
 *
 * const result = await getDecision({
 *   model: 'claude-haiku-3-20250317',
 *   system: '...',
 *   messages: [{ role: 'user', content: '...' }],
 * })
 * ```
 */
export function createStructuredCall<T extends z.ZodType>(
  client: InstanceType<typeof import('@anthropic-ai/sdk').default>,
  schema: T,
  options: {
    name?: string
    description?: string
  } = {},
) {
  const structuredTool = createStructuredTool(schema, options)

  return async function call(
    params: Omit<Anthropic.MessageCreateParams, 'tools' | 'tool_choice'> & {
      /** Additional real tools to include alongside the structured output tool */
      extraTools?: Anthropic.Tool[]
    },
    requestOptions?: { signal?: AbortSignal },
  ): Promise<StructuredOutputResult<z.infer<T>>> {
    const { extraTools, ...apiParams } = params

    const createParams: Anthropic.MessageCreateParamsNonStreaming = {
      ...apiParams,
      tools: [...(extraTools ?? []), structuredTool.tool],
      tool_choice: structuredTool.toolChoice,
      stream: false,
    }

    const response = await client.messages.create(
      createParams,
      requestOptions ? { signal: requestOptions.signal } : undefined,
    )

    return parseStructuredOutput(response, structuredTool)
  }
}
