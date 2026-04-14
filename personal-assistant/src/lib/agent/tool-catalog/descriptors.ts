/**
 * Tool descriptor types for the UnifiedToolCatalog.
 *
 * Descriptors are the lightweight metadata we feed to the model at
 * session start. Full input_schemas load lazily on first invocation so
 * the system prompt stays small — the pattern is borrowed from Claude
 * Code's MCP tool handling, where server tools are lazily expanded to
 * avoid context bloat when dozens of MCP servers are connected.
 */
import type Anthropic from '@anthropic-ai/sdk'

export type ToolSource = 'native' | 'composio' | 'mcp'

export interface ToolDescriptor {
  /** Fully-qualified tool name used by the dispatcher. */
  name: string
  /** One-line summary shown to the model. */
  summary: string
  /** Where the implementation lives. */
  source: ToolSource
  /** Provider id (e.g. 'gmail', 'slack') — links back to the connection. */
  provider?: string
  /** connection_id if this tool is scoped to a specific connection. */
  connectionId?: string
  /** Optional cache key for grouping expansions. */
  category?: string
}

export interface ToolSchemaEntry {
  /** The full Anthropic tool definition the model uses to call. */
  tool: Anthropic.Tool
  /** Descriptor the schema was loaded for. */
  descriptor: ToolDescriptor
}

export type ToolDispatchResult =
  | { success: true; data: unknown }
  | { success: false; error: string }
