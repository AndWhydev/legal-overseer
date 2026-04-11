import type Anthropic from '@anthropic-ai/sdk'
import type { MCPToolLike, MCPCallToolResultLike } from './mcp-types'
import { logger } from '../core/logger'

/**
 * Convert MCP tool schemas to Anthropic.Tool[] for TAOR consumption.
 * Only takes the schema — execution goes through callTool().
 */
export function mcpToolsToAnthropicTools(
  mcpTools: MCPToolLike[],
  maxTools?: number,
): Anthropic.Tool[] {
  const tools = mcpTools.map(tool => ({
    name: tool.name,
    description: tool.description || '',
    input_schema: {
      type: 'object' as const,
      properties: tool.inputSchema.properties || {},
      required: tool.inputSchema.required
        ? [...tool.inputSchema.required]
        : undefined,
    },
  }))

  return maxTools ? tools.slice(0, maxTools) : tools
}

/**
 * Transform MCP tool result into BitBit ToolResult format.
 */
export function transformMCPResult(
  mcpResult: MCPCallToolResultLike,
): { success: boolean; data?: unknown; error?: string } {
  if (mcpResult.isError) {
    const errorText = mcpResult.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('\n')
    return { success: false, error: errorText || 'MCP tool returned error' }
  }

  // Prefer structuredContent (typed object) over text
  if (mcpResult.structuredContent) {
    return { success: true, data: mcpResult.structuredContent }
  }

  const textContent = mcpResult.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  return { success: true, data: textContent }
}

/**
 * HTTP-based MCP client for Composio's MCP endpoint.
 * Uses simple JSON-RPC over HTTP — works in serverless (no stdio, no SSE).
 */
export class ComposioMCPClient {
  private baseUrl: string
  private headers: Record<string, string>

  constructor(url: string, headers: Record<string, string>) {
    this.baseUrl = url
    this.headers = {
      'Content-Type': 'application/json',
      ...headers,
    }
  }

  /**
   * List all available tools from the MCP server.
   */
  async listTools(): Promise<MCPToolLike[]> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      })

      if (!response.ok) {
        logger.error('[mcp-client] listTools failed', {
          status: response.status,
          statusText: response.statusText,
        })
        return []
      }

      const data = await response.json()

      // Handle both JSON-RPC response and direct response formats
      const tools = data.result?.tools || data.tools || []
      return tools as MCPToolLike[]
    } catch (err) {
      logger.error('[mcp-client] listTools error', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  /**
   * Execute a tool call via the MCP server.
   */
  async callTool(params: {
    name: string
    arguments?: Record<string, unknown>
  }): Promise<MCPCallToolResultLike> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: params.name,
            arguments: params.arguments || {},
          },
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        logger.error('[mcp-client] callTool failed', {
          tool: params.name,
          status: response.status,
          body: text.slice(0, 500),
        })
        return {
          content: [{ type: 'text', text: `MCP server error: ${response.status}` }],
          isError: true,
        }
      }

      const data = await response.json()
      return data.result || data
    } catch (err) {
      logger.error('[mcp-client] callTool error', {
        tool: params.name,
        error: err instanceof Error ? err.message : String(err),
      })
      return {
        content: [{ type: 'text', text: `MCP call failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      }
    }
  }
}
