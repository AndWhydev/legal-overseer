declare module '@anthropic-ai/claude-agent-sdk' {
  export interface ToolDefinition {
    name: string
    description: string
    input_schema: Record<string, unknown>
  }

  export interface ToolResult {
    tool_use_id: string
    content: string
  }

  export interface McpServerConfig {
    name?: string
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
    transport?: string
    [key: string]: unknown
  }

  export interface Options {
    model?: string
    system?: string
    maxTokens?: number
    tools?: ToolDefinition[]
    mcpServers?: Record<string, McpServerConfig>
    [key: string]: unknown
  }

  export interface AgentConfig {
    name: string
    description: string
    tools: ToolDefinition[]
    model?: string
    system?: string
  }

  export function defineAgent(config: AgentConfig): AgentConfig
  export function defineTool(tool: ToolDefinition): ToolDefinition
  export function tool(
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (args: Record<string, unknown>) => unknown
  ): ToolDefinition
  export function createSdkMcpServer(config: Record<string, unknown>): McpServerConfig
  export function query(options: Options): AsyncIterable<unknown>
}
