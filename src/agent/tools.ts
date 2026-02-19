/**
 * Custom MCP tools module for BitBit
 *
 * Provides in-process MCP server with BitBit-specific tools
 * for task management, audit logging, and system health checks.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';

/**
 * Default timeout for tool operations (10 seconds)
 */
const TOOL_TIMEOUT_MS = 10000;

/**
 * Wraps an async function with a timeout
 */
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = TOOL_TIMEOUT_MS
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]);
}

/**
 * Get task status tool
 *
 * Queries a task by ID from the SQLite database and returns its current status.
 */
const getTaskStatus = tool(
  'get_task_status',
  'Get the current status of a task by its ID. Returns task details including status, priority, and timestamps.',
  {
    taskId: z.string().describe('The task UUID to look up'),
  },
  async (args) => {
    try {
      const result = await withTimeout(async () => {
        const db = getDatabase();
        const task = db
          .prepare(
            `SELECT id, title, status, priority, created_at, updated_at
             FROM tasks WHERE id = ?`
          )
          .get(args.taskId);

        if (!task) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: 'Task not found', taskId: args.taskId }),
              },
            ],
          };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(task) }],
        };
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage, taskId: args.taskId }),
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Log audit event tool
 *
 * Inserts an audit log entry into the audit_logs table.
 */
const logAuditEvent = tool(
  'log_audit_event',
  'Log an audit event for tracking agent actions. Records action type, entity affected, and optional details.',
  {
    action: z
      .string()
      .describe('The action performed (e.g., "task_created", "query_executed")'),
    entityType: z
      .string()
      .describe('The type of entity affected (e.g., "task", "agent", "system")'),
    entityId: z
      .string()
      .optional()
      .describe('The ID of the entity affected (if applicable)'),
    details: z
      .string()
      .optional()
      .describe('Additional details about the action (JSON string)'),
  },
  async (args) => {
    try {
      const result = await withTimeout(async () => {
        const db = getDatabase();

        // Generate a UUID for the audit log entry
        const id = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        db.prepare(
          `INSERT INTO audit_logs (id, agent_id, task_id, action_type, action_detail, risk_level, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(id, 'system', args.entityId || null, args.action, args.details || '', 'low', timestamp);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                auditLogId: id,
                actionType: args.action,
                riskLevel: 'low',
                timestamp,
              }),
            },
          ],
        };
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage, action: args.action }),
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Health check tool
 *
 * Returns system health status including database connectivity and basic metrics.
 */
const healthCheck = tool(
  'health_check',
  'Check the health status of the BitBit system. Returns database connectivity status, uptime, and basic metrics.',
  {
    verbose: z
      .boolean()
      .optional()
      .describe('Include detailed metrics in the response'),
  },
  async (args) => {
    try {
      const result = await withTimeout(async () => {
        const db = getDatabase();
        const startTime = Date.now();

        // Test database connectivity
        const dbCheck = db.prepare('SELECT 1 as ok').get() as { ok: number } | undefined;
        const dbLatency = Date.now() - startTime;

        // Collect basic metrics if verbose
        let metrics: Record<string, unknown> = {};
        if (args.verbose) {
          const taskCount = db
            .prepare('SELECT COUNT(*) as count FROM tasks')
            .get() as { count: number };
          const auditCount = db
            .prepare('SELECT COUNT(*) as count FROM audit_logs')
            .get() as { count: number };

          metrics = {
            tasks: taskCount?.count || 0,
            auditLogs: auditCount?.count || 0,
            dbLatencyMs: dbLatency,
          };
        }

        const healthStatus = {
          status: dbCheck?.ok === 1 ? 'healthy' : 'degraded',
          database: {
            connected: dbCheck?.ok === 1,
            latencyMs: dbLatency,
          },
          timestamp: new Date().toISOString(),
          version: '0.1.0',
          ...(args.verbose && { metrics }),
        };

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(healthStatus, null, 2) },
          ],
        };
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              status: 'unhealthy',
              error: errorMessage,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * BitBit MCP Server
 *
 * In-process MCP server providing BitBit-specific tools for agent operations.
 */
export const bitbitMcpServer = createSdkMcpServer({
  name: 'bitbit',
  version: '1.0.0',
  tools: [getTaskStatus, logAuditEvent, healthCheck],
});

/**
 * Export individual tools for testing
 */
export const tools = {
  getTaskStatus,
  logAuditEvent,
  healthCheck,
};
