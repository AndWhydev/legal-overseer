/**
 * MCP type definitions — duck-typed to match @modelcontextprotocol/sdk
 * without requiring the dependency. Mirrors the interfaces in
 * @anthropic-ai/sdk/helpers/beta/mcp.
 */

export interface MCPToolLike {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown> | null
    required?: string[] | readonly string[] | null
    [key: string]: unknown
  }
}

export interface MCPCallToolResultLike {
  content: MCPToolResultContentLike[]
  structuredContent?: object
  isError?: boolean
}

export type MCPToolResultContentLike =
  | MCPTextContentLike
  | MCPImageContentLike
  | MCPResourceLinkLike

export interface MCPTextContentLike {
  type: 'text'
  text: string
}

export interface MCPImageContentLike {
  type: 'image'
  data: string
  mimeType: string
}

export interface MCPResourceLinkLike {
  type: 'resource_link'
  uri: string
  name: string
  mimeType?: string
}
