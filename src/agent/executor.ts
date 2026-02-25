/**
 * Agent executor module for BitBit
 *
 * Provides query() wrapper for executing Claude Agent SDK queries
 * with proper error handling, cost guardrails, and logging.
 */

import { query, type Options, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('Executor');

/**
 * Type guard to check if a message has the type property
 */
function hasType(message: unknown): message is { type: string } {
  return typeof message === 'object' && message !== null && 'type' in message;
}

/**
 * Type guard to check if a message is a tool_use_summary type
 */
function isToolUseSummaryMessage(message: unknown): message is { type: 'tool_use_summary'; summary: string } {
  return hasType(message) && message.type === 'tool_use_summary';
}

/**
 * Type guard to check if a message is a tool_progress type
 */
function isToolProgressMessage(message: unknown): message is { type: 'tool_progress'; tool_name: string } {
  return hasType(message) && message.type === 'tool_progress';
}

/**
 * Type guard to check if a message is a result type
 */
function isResultMessage(message: unknown): message is { type: 'result'; subtype: 'success' | 'error'; result?: string; total_cost_usd?: number } {
  return hasType(message) && message.type === 'result';
}

/**
 * Options for configuring query execution
 */
export interface QueryOptions {
  /** Maximum cost in USD before stopping (default: 1.00) */
  maxBudgetUsd?: number;
  /** Maximum number of agent turns (default: 20) */
  maxTurns?: number;
  /** Allowed tools for the query */
  allowedTools?: string[];
  /** Permission mode for tool execution */
  permissionMode?: Options['permissionMode'];
  /** System prompt override */
  systemPrompt?: string;
  /** MCP server configurations */
  mcpServers?: Record<string, McpServerConfig>;
}

/**
 * Result of a query execution
 */
export interface QueryResult {
  /** Whether the query completed successfully */
  success: boolean;
  /** Final output from the agent */
  output: string;
  /** List of tools that were called during execution */
  toolCalls: string[];
  /** Total cost in USD (if available) */
  costUsd?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Default query options
 */
const DEFAULT_OPTIONS: Required<Omit<QueryOptions, 'systemPrompt' | 'mcpServers'>> = {
  maxBudgetUsd: 1.0,
  maxTurns: 20,
  allowedTools: ['Read', 'Glob', 'Grep'],
  permissionMode: 'acceptEdits',
};

/**
 * Execute a query using the Claude Agent SDK
 *
 * Wraps the SDK's query() function with error handling, logging,
 * and cost guardrails appropriate for BitBit operations.
 *
 * @param prompt - The prompt to send to the agent
 * @param options - Optional configuration for the query
 * @returns Promise resolving to the query result
 *
 * @example
 * ```typescript
 * const result = await executeQuery('List all TypeScript files in src/');
 * if (result.success) {
 *   console.log('Output:', result.output);
 *   console.log('Tools used:', result.toolCalls);
 * }
 * ```
 */
export async function executeQuery(
  prompt: string,
  options?: QueryOptions
): Promise<QueryResult> {
  const mergedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const toolCalls: string[] = [];
  let output = '';
  let costUsd: number | undefined;

  const startTime = Date.now();

  logger.info(`Agent query starting: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"`);

  try {
    for await (const message of query({
      prompt,
      options: {
        allowedTools: mergedOptions.allowedTools,
        permissionMode: mergedOptions.permissionMode,
        maxTurns: mergedOptions.maxTurns,
        maxBudgetUsd: mergedOptions.maxBudgetUsd,
        ...(options?.systemPrompt && { systemPrompt: options.systemPrompt }),
        ...(options?.mcpServers && { mcpServers: options.mcpServers }),
      },
    })) {
      // Track tool usage from tool_use_summary messages
      if (isToolUseSummaryMessage(message)) {
        // tool_use_summary contains a summary of tools used
        logger.info(`Agent tool summary: ${message.summary}`);
      }

      // Track tool progress for individual tool calls
      if (isToolProgressMessage(message)) {
        if (!toolCalls.includes(message.tool_name)) {
          toolCalls.push(message.tool_name);
        }
        logger.info(`Agent tool call: ${message.tool_name}`);
      }

      // Capture final result from SDKResultSuccess
      if (isResultMessage(message)) {
        if (message.subtype === 'success') {
          output = message.result || '';
          costUsd = message.total_cost_usd;
        } else {
          // Error result
          costUsd = message.total_cost_usd;
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`Agent query completed in ${duration}ms, ${toolCalls.length} tool calls`);

    return {
      success: true,
      output,
      toolCalls,
      costUsd,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`Agent query failed after ${duration}ms: ${errorMessage}`);

    return {
      success: false,
      output: '',
      toolCalls,
      error: errorMessage,
      costUsd,
    };
  }
}

/**
 * Execute a query with a timeout
 *
 * Wraps executeQuery with an additional timeout guard.
 *
 * @param prompt - The prompt to send to the agent
 * @param timeoutMs - Timeout in milliseconds (default: 60000)
 * @param options - Optional configuration for the query
 * @returns Promise resolving to the query result
 */
export async function executeQueryWithTimeout(
  prompt: string,
  timeoutMs: number = 60000,
  options?: QueryOptions
): Promise<QueryResult> {
  const timeoutPromise = new Promise<QueryResult>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Query timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([executeQuery(prompt, options), timeoutPromise]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: '',
      toolCalls: [],
      error: errorMessage,
    };
  }
}
