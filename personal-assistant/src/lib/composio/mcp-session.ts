import type Anthropic from '@anthropic-ai/sdk'
import { ComposioMCPClient, mcpToolsToAnthropicTools, transformMCPResult } from './mcp-client'
import { logger } from '../core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPSession {
  orgId: string
  client: ComposioMCPClient
  tools: Anthropic.Tool[]
  toolNames: Set<string>
  createdAt: number
  expiresAt: number
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const DEFAULT_MAX_TOOLS = 50

function getCacheTTL(): number {
  const env = process.env.COMPOSIO_MCP_CACHE_TTL
  return env ? parseInt(env, 10) * 1000 : DEFAULT_CACHE_TTL
}

function getMaxTools(): number {
  const env = process.env.COMPOSIO_MCP_MAX_TOOLS
  return env ? parseInt(env, 10) : DEFAULT_MAX_TOOLS
}

// ---------------------------------------------------------------------------
// Session cache (in-memory, Fluid Compute reuses instances)
// ---------------------------------------------------------------------------

const sessionCache = new Map<string, MCPSession>()

/**
 * Check if MCP-native mode is enabled.
 */
export function isMCPEnabled(): boolean {
  return process.env.COMPOSIO_MCP_ENABLED === '1' && Boolean(process.env.COMPOSIO_API_KEY)
}

/**
 * Build the Composio MCP endpoint URL for a user.
 */
function buildMCPUrl(orgId: string): string {
  const serverId = process.env.COMPOSIO_MCP_SERVER_ID
  if (serverId) {
    return `https://backend.composio.dev/v3/mcp/${serverId}?user_id=${orgId}`
  }
  // Fallback: use Composio's default MCP endpoint pattern
  return `https://backend.composio.dev/v3/mcp/default?user_id=${orgId}`
}

function buildMCPHeaders(): Record<string, string> {
  return {
    'x-api-key': process.env.COMPOSIO_API_KEY || '',
  }
}

/**
 * Get or create an MCP session for an org.
 * Returns cached session if valid, otherwise creates a new one.
 */
export async function getOrCreateMCPSession(orgId: string): Promise<MCPSession | null> {
  if (!isMCPEnabled()) return null

  // Check cache
  const cached = sessionCache.get(orgId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached
  }

  try {
    const url = buildMCPUrl(orgId)
    const headers = buildMCPHeaders()
    const client = new ComposioMCPClient(url, headers)

    // Discover available tools
    const mcpTools = await client.listTools()
    const tools = mcpToolsToAnthropicTools(mcpTools, getMaxTools())
    const toolNames = new Set(tools.map(t => t.name))

    const session: MCPSession = {
      orgId,
      client,
      tools,
      toolNames,
      createdAt: Date.now(),
      expiresAt: Date.now() + getCacheTTL(),
    }

    sessionCache.set(orgId, session)

    logger.info('[mcp-session] Session created', {
      orgId,
      toolCount: tools.length,
      ttl: getCacheTTL(),
    })

    return session
  } catch (err) {
    logger.error('[mcp-session] Failed to create session', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Invalidate cached MCP session(s).
 * Pass '*' to clear all sessions (e.g., during tests).
 * Pass a specific orgId to clear that org's session.
 */
export function invalidateMCPSession(orgId: string): void {
  if (orgId === '*') {
    sessionCache.clear()
    return
  }
  sessionCache.delete(orgId)
  logger.info('[mcp-session] Session invalidated', { orgId })
}

/**
 * Execute an MCP tool call through the session.
 * Returns null if the tool isn't an MCP tool.
 */
export async function executeMCPTool(
  orgId: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string } | null> {
  const session = await getOrCreateMCPSession(orgId)
  if (!session) return null
  if (!session.toolNames.has(toolName)) return null

  const mcpResult = await session.client.callTool({
    name: toolName,
    arguments: input,
  })

  return transformMCPResult(mcpResult)
}

/**
 * Get MCP tools for an org (for merging into TAOR tool set).
 * Returns empty array if MCP is disabled or session fails.
 */
export async function getMCPTools(orgId: string): Promise<Anthropic.Tool[]> {
  const session = await getOrCreateMCPSession(orgId)
  return session?.tools ?? []
}

/**
 * Check if a tool name belongs to an MCP session for this org.
 */
export async function isMCPTool(orgId: string, toolName: string): Promise<boolean> {
  const session = await getOrCreateMCPSession(orgId)
  return session?.toolNames.has(toolName) ?? false
}
