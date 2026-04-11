/**
 * ClickUp MCP Server Configuration
 *
 * Provides configuration for the @taazkareem/clickup-mcp-server
 * to be used with Claude Agent SDK queries.
 *
 * The MCP server enables agent access to ClickUp workspaces,
 * tasks, and comments through standardized MCP tools.
 */

import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('ClickUpConfig');

/**
 * Environment variables required for ClickUp integration
 */
const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY;
const CLICKUP_TEAM_ID = process.env.CLICKUP_TEAM_ID;
const CLICKUP_MCP_LICENSE_KEY = process.env.CLICKUP_MCP_LICENSE_KEY;

/**
 * Tools enabled for ClickUp MCP server.
 * Restricted to essential operations for security.
 */
const ENABLED_TOOLS = [
  'get_workspace_hierarchy',
  'get_tasks',
  'get_task',
  'create_task',
  'update_task',
  'create_comment',
  'get_comments',
].join(',');

/**
 * Check if ClickUp integration is fully configured
 *
 * @returns true if all required environment variables are set
 */
export function isClickUpConfigured(): boolean {
  return Boolean(CLICKUP_API_KEY && CLICKUP_TEAM_ID && CLICKUP_MCP_LICENSE_KEY);
}

/**
 * Get ClickUp MCP server configuration for Claude Agent SDK
 *
 * Returns configuration for the @taazkareem/clickup-mcp-server
 * that can be passed to query() options.mcpServers.
 *
 * @returns McpServerConfig if configured, null if missing env vars
 *
 * @example
 * ```typescript
 * const clickupConfig = getClickUpMcpConfig();
 * if (clickupConfig) {
 *   const result = await query({
 *     prompt: 'List tasks in review status',
 *     options: {
 *       mcpServers: { clickup: clickupConfig }
 *     }
 *   });
 * }
 * ```
 */
export function getClickUpMcpConfig(): McpServerConfig | null {
  // Check all required values exist before using
  if (!CLICKUP_API_KEY || !CLICKUP_TEAM_ID || !CLICKUP_MCP_LICENSE_KEY) {
    return null;
  }

  return {
    command: 'npx',
    args: ['-y', '@taazkareem/clickup-mcp-server@latest'],
    env: {
      CLICKUP_API_KEY,
      CLICKUP_TEAM_ID,
      CLICKUP_MCP_LICENSE_KEY,
      ENABLED_TOOLS,
    },
  };
}

/**
 * Get partial team ID for display (security: don't expose full ID)
 *
 * @returns First 4 characters of team ID, or null if not configured
 */
export function getClickUpTeamIdPartial(): string | null {
  if (!CLICKUP_TEAM_ID) {
    return null;
  }
  return CLICKUP_TEAM_ID.slice(0, 4);
}

/**
 * Log ClickUp configuration status on startup
 */
export function logClickUpStatus(): void {
  if (isClickUpConfigured()) {
    logger.info('ClickUp integration: ENABLED');
  } else {
    const missing: string[] = [];
    if (!CLICKUP_API_KEY) missing.push('CLICKUP_API_KEY');
    if (!CLICKUP_TEAM_ID) missing.push('CLICKUP_TEAM_ID');
    if (!CLICKUP_MCP_LICENSE_KEY) missing.push('CLICKUP_MCP_LICENSE_KEY');
    logger.info(`ClickUp integration: DISABLED (set ${missing.join(', ')})`);
  }
}
