/**
 * Gmail MCP client wrapper
 *
 * Provides typed interface to Gmail MCP server tools.
 * Uses executeQuery pattern for MCP tool invocation.
 * Protected by circuit breaker to handle Gmail API outages gracefully.
 *
 * Note: This module is designed to work with the Gmail MCP server
 * (@gongrzhe/server-gmail-autoauth-mcp) when configured in the agent.
 */

import {
  executeQuery,
  type QueryOptions,
  type QueryResult,
} from '../../../agent/executor.js';
import { createCircuitBreaker, createSafeLogger } from '../../../governance/index.js';

const logger = createSafeLogger('GmailClient');
const MCP_SERVER = 'gmail';

/**
 * Gmail search result from search_emails tool
 */
export interface GmailSearchResult {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  hasAttachment: boolean;
}

/**
 * Gmail attachment metadata
 */
export interface GmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Full email content from read_email tool
 */
export interface GmailEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string[];
  date: string;
  body: string;
  attachments: GmailAttachment[];
}

/**
 * Default query options for Gmail operations
 */
const GMAIL_DEFAULTS: Partial<QueryOptions> = {
  maxBudgetUsd: 0.25,
  maxTurns: 3,
};

/**
 * Get MCP server configuration for Gmail
 *
 * Gmail MCP server uses stdio transport with autoauth
 */
export function getGmailMcpConfig(): {
  command: string;
  args: string[];
} | null {
  // Gmail MCP server uses npx to run
  // Configuration is handled by the server's autoauth mechanism
  return {
    command: 'npx',
    args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
  };
}

/**
 * Internal function to execute Gmail query (wrapped by circuit breaker)
 */
async function executeGmailQueryInternal(
  prompt: string,
  allowedTools: string[]
): Promise<QueryResult> {
  const mcpConfig = getGmailMcpConfig();

  if (!mcpConfig) {
    return {
      success: false,
      output: '',
      toolCalls: [],
      error: 'Gmail MCP server not configured',
    };
  }

  return executeQuery(prompt, {
    ...GMAIL_DEFAULTS,
    allowedTools,
    mcpServers: {
      [MCP_SERVER]: mcpConfig,
    },
  });
}

/**
 * Circuit breaker for Gmail MCP
 * - Timeout: 5000ms
 * - Error threshold: 50%
 * - Reset timeout: 30000ms
 */
const gmailBreaker = createCircuitBreaker<QueryResult>(
  'gmail',
  executeGmailQueryInternal as unknown as (...args: unknown[]) => Promise<QueryResult>,
  {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  }
);

/**
 * Execute a query with Gmail MCP server configuration
 * Protected by circuit breaker for resilience.
 *
 * @param prompt - The prompt to execute
 * @param allowedTools - Tools to allow for this query
 * @returns Query result
 */
async function executeGmailQuery(
  prompt: string,
  allowedTools: string[]
): Promise<QueryResult> {
  try {
    const result = await gmailBreaker.fire(prompt, allowedTools) as QueryResult;
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('Gmail query failed', { error: errorMsg });
    return {
      success: false,
      output: '',
      toolCalls: [],
      error: `Gmail unavailable: ${errorMsg}`,
    };
  }
}

/**
 * Search for emails using Gmail query syntax
 *
 * @param query - Gmail search query (e.g., "has:attachment filename:pdf is:unread")
 * @param maxResults - Maximum number of results (default 10)
 * @returns Array of search results
 *
 * @example
 * ```typescript
 * const results = await searchEmails('has:attachment filename:pdf is:unread', 20);
 * for (const email of results) {
 *   console.log(`${email.subject} from ${email.from}`);
 * }
 * ```
 */
export async function searchEmails(
  query: string,
  maxResults = 10
): Promise<GmailSearchResult[]> {
  const prompt = `Use the Gmail MCP search_emails tool to search for emails with query: "${query}" and maxResults: ${maxResults}. Return the results as a JSON array of objects with fields: id, threadId, subject, from, date, snippet, hasAttachment. Output ONLY the JSON array, no explanation.`;

  const result = await executeGmailQuery(prompt, [
    'mcp__gmail__search_emails',
  ]);

  if (!result.success) {
    throw new Error(`Gmail search failed: ${result.error}`);
  }

  try {
    // Parse JSON from output, handling potential markdown code blocks
    let jsonStr = result.output.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    return JSON.parse(jsonStr) as GmailSearchResult[];
  } catch {
    logger.warn('Failed to parse search results', { output: result.output.substring(0, 100) });
    return [];
  }
}

/**
 * Read full email content including attachments list
 *
 * @param messageId - Gmail message ID
 * @returns Full email content
 *
 * @example
 * ```typescript
 * const email = await readEmail('abc123');
 * console.log(`Subject: ${email.subject}`);
 * console.log(`Attachments: ${email.attachments.length}`);
 * ```
 */
export async function readEmail(messageId: string): Promise<GmailEmail> {
  const prompt = `Use the Gmail MCP read_email tool to read email with messageId: "${messageId}". Return the email as JSON with fields: id, threadId, subject, from, to (array), date, body, attachments (array with id, filename, mimeType, size). Output ONLY the JSON, no explanation.`;

  const result = await executeGmailQuery(prompt, ['mcp__gmail__read_email']);

  if (!result.success) {
    throw new Error(`Failed to read email ${messageId}: ${result.error}`);
  }

  try {
    let jsonStr = result.output.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    return JSON.parse(jsonStr) as GmailEmail;
  } catch {
    throw new Error(`Failed to parse email ${messageId}: ${result.output}`);
  }
}

/**
 * Download an attachment to local disk
 *
 * @param messageId - Gmail message ID
 * @param attachmentId - Attachment ID from email
 * @param savePath - Directory to save to (default /data/tmp/invoices/)
 * @param filename - Optional filename override
 * @returns Full path to downloaded file
 *
 * @example
 * ```typescript
 * const path = await downloadAttachment(
 *   'msg123',
 *   'att456',
 *   '/data/tmp/invoices/',
 *   'invoice.pdf'
 * );
 * console.log(`Downloaded to: ${path}`);
 * ```
 */
export async function downloadAttachment(
  messageId: string,
  attachmentId: string,
  savePath = '/data/tmp/invoices/',
  filename?: string
): Promise<string> {
  const filenameArg = filename ? `, filename: "${filename}"` : '';
  const prompt = `Use the Gmail MCP download_attachment tool to download attachment with messageId: "${messageId}", attachmentId: "${attachmentId}", savePath: "${savePath}"${filenameArg}. Return the full path to the downloaded file as plain text. Output ONLY the path, no explanation.`;

  const result = await executeGmailQuery(prompt, [
    'mcp__gmail__download_attachment',
  ]);

  if (!result.success) {
    throw new Error(`Failed to download attachment: ${result.error}`);
  }

  // Return path from output, trimming any whitespace
  const downloadedPath = result.output.trim();
  return downloadedPath || `${savePath}${filename}`;
}

/**
 * Mark email as read by removing UNREAD label
 *
 * @param messageId - Gmail message ID
 *
 * @example
 * ```typescript
 * await markAsRead('msg123');
 * ```
 */
export async function markAsRead(messageId: string): Promise<void> {
  const prompt = `Use the Gmail MCP modify_email tool to modify email with messageId: "${messageId}", removeLabelIds: ["UNREAD"]. Confirm the modification was successful.`;

  const result = await executeGmailQuery(prompt, ['mcp__gmail__modify_email']);

  if (!result.success) {
    logger.warn(`Failed to mark email ${messageId} as read`, { error: result.error });
  }
}

/**
 * Add labels to an email (e.g., "Processed", "BitBit")
 *
 * @param messageId - Gmail message ID
 * @param labelIds - Label IDs to add
 *
 * @example
 * ```typescript
 * await addLabels('msg123', ['Label_1234567890']);
 * ```
 */
export async function addLabels(
  messageId: string,
  labelIds: string[]
): Promise<void> {
  const labelsJson = JSON.stringify(labelIds);
  const prompt = `Use the Gmail MCP modify_email tool to modify email with messageId: "${messageId}", addLabelIds: ${labelsJson}. Confirm the modification was successful.`;

  const result = await executeGmailQuery(prompt, ['mcp__gmail__modify_email']);

  if (!result.success) {
    logger.warn(`Failed to add labels to ${messageId}`, { error: result.error });
  }
}

/**
 * Get or create a Gmail label by name
 *
 * @param name - Label name (e.g., "BitBit/Processed")
 * @returns Label ID
 *
 * @example
 * ```typescript
 * const labelId = await getOrCreateLabel('BitBit/Invoices');
 * await addLabels('msg123', [labelId]);
 * ```
 */
export async function getOrCreateLabel(name: string): Promise<string> {
  const prompt = `Use the Gmail MCP get_or_create_label tool with name: "${name}". Return ONLY the label ID, no explanation.`;

  const result = await executeGmailQuery(prompt, [
    'mcp__gmail__get_or_create_label',
  ]);

  if (!result.success) {
    throw new Error(`Failed to get/create label "${name}": ${result.error}`);
  }

  return result.output.trim();
}
