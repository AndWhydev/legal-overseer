/**
 * Dynamic Tool Pattern
 *
 * Generate tool schemas at runtime based on configuration, user permissions,
 * or external metadata. Uses `dynamicTool` from the AI SDK so the schema is
 * resolved lazily rather than declared statically.
 *
 * Ported from: aisdkagents-patterns/tool-api-dynamic-tool
 */

import { dynamicTool, type Tool } from 'ai'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single field definition used to build a Zod schema dynamically. */
export interface DynamicFieldDef {
  /** Field name (object key). */
  name: string
  /** Zod-compatible type hint. */
  type: 'string' | 'number' | 'boolean' | 'enum'
  /** Human description surfaced to the model. */
  description: string
  /** For type=enum, the allowed values. */
  enumValues?: readonly [string, ...string[]]
  /** Whether the field is optional. */
  optional?: boolean
}

/** Blueprint from which a dynamic tool is generated. */
export interface DynamicToolBlueprint<TResult = unknown> {
  /** Tool name (used as key in the tools map). */
  name: string
  /** Description for the LLM. */
  description: string
  /** Field definitions — order is preserved. */
  fields: DynamicFieldDef[]
  /** Execute implementation receiving a plain object matching the schema. */
  execute: (input: Record<string, unknown>) => Promise<TResult>
}

// ---------------------------------------------------------------------------
// Schema builder
// ---------------------------------------------------------------------------

/**
 * Build a `z.ZodObject` from an array of `DynamicFieldDef`.
 */
export function buildSchemaFromFields(
  fields: DynamicFieldDef[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const f of fields) {
    let base: z.ZodTypeAny

    switch (f.type) {
      case 'number':
        base = z.number().describe(f.description)
        break
      case 'boolean':
        base = z.boolean().describe(f.description)
        break
      case 'enum':
        if (!f.enumValues || f.enumValues.length === 0) {
          throw new Error(`Enum field "${f.name}" requires at least one value`)
        }
        base = z.enum(f.enumValues).describe(f.description)
        break
      case 'string':
      default:
        base = z.string().describe(f.description)
        break
    }

    shape[f.name] = f.optional ? base.optional() : base
  }

  return z.object(shape)
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a single dynamic tool from a blueprint.
 *
 * @example
 * ```ts
 * const tools = createDynamicTool({
 *   name: 'convertCurrency',
 *   description: 'Convert between currencies',
 *   fields: [
 *     { name: 'amount', type: 'number', description: 'Amount to convert' },
 *     { name: 'from', type: 'string', description: 'Source currency code' },
 *     { name: 'to', type: 'string', description: 'Target currency code' },
 *   ],
 *   execute: async ({ amount, from, to }) => {
 *     // conversion logic...
 *     return { amount, from, to, result: convertedValue }
 *   },
 * })
 * ```
 */
export function createDynamicTool<TResult = unknown>(
  blueprint: DynamicToolBlueprint<TResult>,
): Record<string, Tool<Record<string, unknown>, TResult>> {
  const inputSchema = buildSchemaFromFields(blueprint.fields)

  return {
    [blueprint.name]: dynamicTool({
      description: blueprint.description,
      inputSchema,
      execute: blueprint.execute,
    }),
  } as Record<string, Tool<Record<string, unknown>, TResult>>
}

/**
 * Merge multiple dynamic tool blueprints into a single tools record.
 * Useful when the set of available tools depends on runtime config.
 *
 * @example
 * ```ts
 * const blueprints = await loadBlueprintsForTenant(tenantId)
 * const tools = createDynamicToolSet(blueprints)
 * const result = await generateText({ model, tools, prompt })
 * ```
 */
export function createDynamicToolSet(
  blueprints: DynamicToolBlueprint[],
): Record<string, Tool<Record<string, unknown>, unknown>> {
  const tools: Record<string, Tool<Record<string, unknown>, unknown>> = {}
  for (const bp of blueprints) {
    Object.assign(tools, createDynamicTool(bp))
  }
  return tools
}
