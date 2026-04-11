/**
 * ClickUp Service Module for BitBit
 *
 * Provides wrappers around executeQuery() with ClickUp MCP configuration
 * for common task operations. These functions enable agents to read
 * and update ClickUp tasks during skill execution.
 *
 * All operations are protected by a circuit breaker to prevent cascading
 * failures when ClickUp is unavailable.
 */

import { executeQuery, type QueryOptions, type QueryResult } from '../../agent/executor.js';
import { getClickUpMcpConfig } from './config.js';
import { createCircuitBreaker, createSafeLogger } from '../../governance/index.js';
import type { QAReport } from './types.js';

const logger = createSafeLogger('ClickUpService');

/**
 * Default options for ClickUp queries
 * Lower limits for read-only operations to control costs
 */
const CLICKUP_READ_DEFAULTS: Partial<QueryOptions> = {
  maxBudgetUsd: 0.5,
  maxTurns: 5,
  allowedTools: ['Read', 'mcp__clickup__get_task', 'mcp__clickup__get_tasks', 'mcp__clickup__get_workspace_hierarchy'],
};

const CLICKUP_WRITE_DEFAULTS: Partial<QueryOptions> = {
  maxBudgetUsd: 0.5,
  maxTurns: 5,
  allowedTools: ['Read', 'mcp__clickup__update_task', 'mcp__clickup__create_comment'],
};

/**
 * Internal function to execute ClickUp query
 * This is wrapped by the circuit breaker
 */
async function executeClickUpQueryInternal(
  prompt: string,
  options: QueryOptions
): Promise<QueryResult> {
  return executeQuery(prompt, options);
}

/**
 * Circuit breaker for ClickUp API
 * - Timeout: 5000ms (ClickUp can be slow)
 * - Error threshold: 50%
 * - Reset timeout: 30000ms
 */
const clickupBreaker = createCircuitBreaker<QueryResult>(
  'clickup',
  executeClickUpQueryInternal as unknown as (...args: unknown[]) => Promise<QueryResult>,
  {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  }
);

/**
 * Execute a query with ClickUp MCP server configuration
 *
 * Automatically merges ClickUp MCP config into the options.
 * Returns error result if ClickUp is not configured.
 * Protected by circuit breaker for resilience.
 *
 * @param prompt - The prompt to execute
 * @param options - Optional query configuration
 * @returns Query result or error if not configured
 *
 * @example
 * ```typescript
 * const result = await executeClickUpQuery(
 *   'Get task abc123 from ClickUp'
 * );
 * ```
 */
export async function executeClickUpQuery(
  prompt: string,
  options?: QueryOptions
): Promise<QueryResult> {
  const mcpConfig = getClickUpMcpConfig();

  if (!mcpConfig) {
    logger.info('ClickUp query skipped: not configured');
    return {
      success: false,
      output: '',
      toolCalls: [],
      error: 'ClickUp not configured. Set CLICKUP_API_KEY, CLICKUP_TEAM_ID, and CLICKUP_MCP_LICENSE_KEY.',
    };
  }

  // Merge MCP config into options
  const mergedOptions: QueryOptions = {
    ...options,
    mcpServers: {
      ...options?.mcpServers,
      clickup: mcpConfig,
    },
  };

  // Execute through circuit breaker
  try {
    const result = await clickupBreaker.fire(prompt, mergedOptions) as QueryResult;
    return result;
  } catch (error) {
    // Circuit is open or operation failed
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('ClickUp query failed', { error: errorMsg });
    return {
      success: false,
      output: '',
      toolCalls: [],
      error: `ClickUp unavailable: ${errorMsg}`,
    };
  }
}

/**
 * Fetch a single task from ClickUp by ID
 *
 * @param taskId - The ClickUp task ID
 * @returns Query result with task details as JSON in output
 *
 * @example
 * ```typescript
 * const result = await getTask('abc123');
 * if (result.success) {
 *   const task = JSON.parse(result.output);
 *   console.log('Task name:', task.name);
 * }
 * ```
 */
export async function getTask(taskId: string): Promise<QueryResult> {
  const prompt = `Use the ClickUp MCP get_task tool to fetch task "${taskId}". Return the task details as JSON including: id, name, description, status, assignees, tags, and any custom fields. Output ONLY the JSON, no explanation.`;

  return executeClickUpQuery(prompt, CLICKUP_READ_DEFAULTS);
}

/**
 * Update a task's status in ClickUp
 *
 * @param taskId - The ClickUp task ID
 * @param status - The new status to set
 * @returns Query result confirming the update
 *
 * @example
 * ```typescript
 * const result = await updateTaskStatus('abc123', 'complete');
 * if (result.success) {
 *   console.log('Task status updated');
 * }
 * ```
 */
export async function updateTaskStatus(
  taskId: string,
  status: string
): Promise<QueryResult> {
  const prompt = `Use the ClickUp MCP update_task tool to change task "${taskId}" status to "${status}". Confirm the update was successful.`;

  return executeClickUpQuery(prompt, CLICKUP_WRITE_DEFAULTS);
}

/**
 * Get the workspace hierarchy from ClickUp
 *
 * Returns all spaces, folders, and lists in the workspace.
 * Useful for discovering where to create tasks or understanding
 * the workspace structure.
 *
 * @returns Query result with hierarchy as JSON
 *
 * @example
 * ```typescript
 * const result = await getWorkspaceHierarchy();
 * if (result.success) {
 *   const hierarchy = JSON.parse(result.output);
 *   console.log('Spaces:', hierarchy.spaces.map(s => s.name));
 * }
 * ```
 */
export async function getWorkspaceHierarchy(): Promise<QueryResult> {
  const prompt = `Use the ClickUp MCP get_workspace_hierarchy tool to list all spaces, folders, and lists. Return the hierarchy as JSON. Output ONLY the JSON, no explanation.`;

  return executeClickUpQuery(prompt, CLICKUP_READ_DEFAULTS);
}

/**
 * Post a comment to a ClickUp task
 *
 * @param taskId - The ClickUp task ID
 * @param comment - The comment text to post
 * @returns Query result confirming the comment was posted
 *
 * @example
 * ```typescript
 * const result = await postTaskComment('abc123', 'QA review complete - approved');
 * ```
 */
export async function postTaskComment(
  taskId: string,
  comment: string
): Promise<QueryResult> {
  const prompt = `Use the ClickUp MCP create_comment tool to post a comment on task "${taskId}". Comment text: "${comment}". Confirm the comment was posted successfully.`;

  return executeClickUpQuery(prompt, CLICKUP_WRITE_DEFAULTS);
}

/**
 * Format a QA report as markdown for posting as a comment
 *
 * @param report - The QA report to format
 * @returns Formatted markdown string
 */
export function formatQAReport(report: QAReport): string {
  const recommendationEmoji: Record<QAReport['recommendation'], string> = {
    approve: '✅ Approved',
    reject: '❌ Rejected',
    review: '👀 Needs Review',
  };

  const issuesList =
    report.issues.length > 0
      ? report.issues.map((issue) => `- ${issue}`).join('\n')
      : '- None found';

  const feedbackSection = report.feedback
    ? `\n### Feedback\n${report.feedback}\n`
    : '';

  return `## 🤖 BitBit QA Report

**Score:** ${report.score}/100
**Recommendation:** ${recommendationEmoji[report.recommendation]}

### Issues Found
${issuesList}
${feedbackSection}
---
*Automated analysis by BitBit Gatekeeper*`;
}

/**
 * Post a formatted QA report as a comment on a ClickUp task
 *
 * @param taskId - The ClickUp task ID
 * @param report - The QA report to post
 * @returns Query result confirming the comment was posted
 *
 * @example
 * ```typescript
 * const result = await postQAReport('abc123', {
 *   score: 85,
 *   issues: ['Minor audio sync issue at 0:15'],
 *   recommendation: 'review'
 * });
 * ```
 */
export async function postQAReport(
  taskId: string,
  report: QAReport
): Promise<QueryResult> {
  const formattedReport = formatQAReport(report);
  return postTaskComment(taskId, formattedReport);
}
