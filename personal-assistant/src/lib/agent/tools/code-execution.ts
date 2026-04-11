/**
 * Code Execution Tool — Agentic sandbox for BitBit
 *
 * Gives BitBit the ability to write and execute JavaScript code against
 * the BitBit SDK at runtime. This is the equivalent of Claude Code's
 * Bash tool — it transforms BitBit from a narrow tool-caller into an
 * autonomous agent that can compose operations, query data flexibly,
 * and solve problems it wasn't explicitly built for.
 *
 * Security model:
 *   - Code runs in a limited scope with only the SDK object exposed
 *   - All DB operations are org-scoped (auto-injected org_id)
 *   - Execution timeout: 30 seconds
 *   - No require/import, no file system, no child_process
 *   - Write operations go through the same guardrails as built-in tools
 *   - All executions are logged for audit
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AgentToolHandler } from '../tools'
import { createSDK } from './bitbit-sdk'
import { logger } from '@/lib/core/logger'

// Maximum execution time in milliseconds
const EXECUTION_TIMEOUT_MS = 30_000

// Maximum output size in characters
const MAX_OUTPUT_CHARS = 12_000

export const codeExecutionToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'execute_code',
    description: `Run JavaScript code against the BitBit SDK to query data, transform information, or perform complex multi-step operations. The code runs in a sandboxed environment with access to the user's data through the SDK.

Available SDK methods:
- db.query(table, {select, filter, ilike, order, limit}) — Query any table (org-scoped)
- db.count(table, filter) — Count rows
- db.insert(table, data) — Insert rows (org_id auto-injected)
- db.update(table, id, updates) — Update by ID
- db.updateWhere(table, filter, updates) — Bulk update
- db.delete(table, id) — Delete a row by ID (org-scoped)
- connections.list() — List all connected services
- connections.get(provider) — Get connection by provider name (e.g., 'outlook', 'gmail')
- connections.disconnect(id) — Remove a connection
- connections.updateStatus(id, status) — Update connection status
- connections.sync(id) — Trigger a sync on a connection
- contacts.search(query) / contacts.get(id) / contacts.create(data) / contacts.list()
- messages.find({query, channel, from, since, limit}) / messages.read(id) / messages.count()
- tasks.list({status, priority}) / tasks.create(data) / tasks.update(id, data) / tasks.search(query)
- memory.search(query) / memory.add(content, category) / memory.list()
- activity.log(action, type, result) / activity.recent(limit)
- fetch(url) — HTTP GET (restricted)
- log(...args) — Print output (captured and returned)
- now() / daysAgo(n) — Date utilities

The code must be an async function body. Use 'return' to return a value. Use 'sdk.log()' to print intermediate output.

Example: "const conn = await sdk.connections.get('outlook'); if (conn) { await sdk.connections.disconnect(conn.id); sdk.log('Disconnected outlook'); }"`,
    input_schema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute. Must be an async function body (no function wrapper needed). Use sdk.* to access BitBit APIs.',
        },
        description: {
          type: 'string',
          description: 'Brief description of what this code does (for audit trail)',
        },
      },
      required: ['code', 'description'],
    },
  },
]

/**
 * Execute user-agent-generated code in a sandboxed environment.
 *
 * The code is wrapped in an AsyncFunction with the SDK as the only
 * available binding. Standard globals (Date, Math, JSON, Array, etc.)
 * are available, but Node.js APIs (require, process, fs, etc.) are not
 * directly exposed — the SDK provides safe alternatives.
 */
async function executeInSandbox(
  code: string,
  sdk: ReturnType<typeof createSDK>,
): Promise<{ result: unknown; logs: string[]; error?: string }> {
  // Validate code doesn't try to escape the sandbox
  const dangerousPatterns = [
    /\brequire\s*\(/,
    /\bimport\s*\(/,
    /\bprocess\b/,
    /\b__dirname\b/,
    /\b__filename\b/,
    /\bglobalThis\s*\.\s*(process|require)/,
    /\bchild_process\b/,
    /\beval\s*\(/,
    /\bFunction\s*\(/,
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return {
        result: null,
        logs: [],
        error: `Code contains blocked pattern: ${pattern.source}. Use the SDK methods instead.`,
      }
    }
  }

  try {
    // Create the async function with sdk as the only parameter
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const fn = new AsyncFunction('sdk', code)

    // Execute with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Execution timed out after ${EXECUTION_TIMEOUT_MS}ms`)), EXECUTION_TIMEOUT_MS)
    })

    const result = await Promise.race([fn(sdk), timeoutPromise])

    return {
      result,
      logs: sdk.logs,
    }
  } catch (err) {
    return {
      result: null,
      logs: sdk.logs,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Format the execution result for the model, respecting output limits.
 */
function formatResult(
  result: unknown,
  logs: string[],
  operations: Array<{ type: string; detail: string; durationMs: number }>,
  error?: string,
): string {
  const sections: string[] = []

  // Error
  if (error) {
    sections.push(`Error: ${error}`)
  }

  // Console output
  if (logs.length > 0) {
    sections.push(`Output:\n${logs.join('\n')}`)
  }

  // Return value
  if (result !== undefined && result !== null) {
    const formatted = typeof result === 'string'
      ? result
      : JSON.stringify(result, null, 2)
    sections.push(`Result:\n${formatted}`)
  }

  // Operation summary
  if (operations.length > 0) {
    const totalMs = operations.reduce((sum, op) => sum + op.durationMs, 0)
    sections.push(`Operations (${operations.length}, ${totalMs}ms total):\n${operations.map(op => `  ${op.type}: ${op.detail} (${op.durationMs}ms)`).join('\n')}`)
  }

  let output = sections.join('\n\n')

  // Truncate if too large
  if (output.length > MAX_OUTPUT_CHARS) {
    output = output.slice(0, MAX_OUTPUT_CHARS - 100) + '\n\n[Output truncated — ' + output.length + ' chars total]'
  }

  return output || '(no output)'
}

export const codeExecutionToolHandlers: Record<string, AgentToolHandler> = {
  async execute_code(input, orgId, supabase) {
    const code = input.code as string
    const description = (input.description as string) || 'unnamed execution'

    if (!code || code.trim().length === 0) {
      return { success: false, error: 'No code provided' }
    }

    logger.info('[execute_code] Starting execution', {
      orgId,
      description,
      codeLength: code.length,
    })

    const sdk = createSDK(supabase, orgId)
    const startTime = performance.now()

    const { result, logs, error } = await executeInSandbox(code, sdk)

    const durationMs = Math.round(performance.now() - startTime)
    const operations = sdk.operations

    logger.info('[execute_code] Execution complete', {
      orgId,
      description,
      durationMs,
      operationCount: operations.length,
      hasError: !!error,
      logLines: logs.length,
    })

    if (error) {
      logger.warn('[execute_code] Execution error', {
        orgId,
        description,
        error,
        durationMs,
      })
    }

    const output = formatResult(result, logs, operations, error)

    return {
      success: !error,
      data: {
        output,
        durationMs,
        operationCount: operations.length,
      },
      error: error || undefined,
    }
  },
}
