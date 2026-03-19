/**
 * Parallel tool executor for the agent engine.
 *
 * Extracted from the monolithic engine.ts to be called by the TAOR loop.
 * Handles:
 * - Per-role budget checks (growth tools: ads, seo, content, tenders)
 * - Per-execution token cap enforcement
 * - Promise.allSettled parallel tool dispatch
 * - Result processing: citations, action reflection, JIT instructions, truncation
 * - Event collection (returned, not yielded)
 */

import type Anthropic from '@anthropic-ai/sdk'
import { executeAgentTool, getJITInstruction, type ExecuteToolOptions } from '@/lib/agent/tools'
import { checkRoleBudget, getExecutionTokenCap, type RoleBudgetResult } from '@/lib/agent/cost-guard'
import { extractCitationsFromToolResult } from '@/lib/agent/citation-extractor'
import { reflectAction } from '@/lib/context/action-reflector'
import { logger } from '@/lib/core/logger'
import type { EngineConfig, AgentEvent } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum characters for a single tool result before truncation. */
export const MAX_TOOL_RESULT_CHARS = 12_000

/** Maps growth tool names to their budget role. Tools not here are unbounded. */
export const TOOL_ROLE_MAP: Record<string, string> = {
  // Ads
  generate_ad_scripts: 'ads',
  list_ad_batches: 'ads',
  adapt_script: 'ads',
  // SEO
  audit_visibility: 'seo',
  generate_seo_content: 'seo',
  generate_schema_markup: 'seo',
  visibility_report: 'seo',
  // Content
  schedule_post: 'content',
  generate_blog: 'content',
  content_calendar: 'content',
  // Tenders
  search_tenders: 'tenders',
  score_tender: 'tenders',
  generate_tender_response: 'tenders',
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ToolExecutionResult {
  toolResults: Anthropic.ToolResultBlockParam[]
  events: AgentEvent[]
  activeRole?: string
  executionCapHit: boolean
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

/**
 * Execute a batch of tool_use blocks in parallel, enforcing budgets and caps.
 *
 * Collects AgentEvent objects in an array (the caller yields them).
 * This keeps the function pure-async and testable without generator mechanics.
 */
export async function executeToolBatch(
  toolBlocks: Anthropic.ToolUseBlock[],
  config: EngineConfig,
  execOptions: ExecuteToolOptions | undefined,
  executionTokens: number,
  activeRole: string | undefined,
): Promise<ToolExecutionResult> {
  const events: AgentEvent[] = []
  const toolResults: Anthropic.ToolResultBlockParam[] = []
  let currentActiveRole = activeRole
  let executionCapHit = false

  // ── Per-role budget check ────────────────────────────────────────────
  // Check budgets for any growth tools in this batch. Collect per-tool overrides.
  const toolBudgetOverrides = new Map<
    string,
    { blocked: boolean; warning: boolean; role: string; result: RoleBudgetResult }
  >()

  for (const tool of toolBlocks) {
    const role = TOOL_ROLE_MAP[tool.name]
    if (!role || config.skipCostGuard) continue

    // Track the active role for execution cap enforcement
    if (!currentActiveRole) currentActiveRole = role

    const budget = await checkRoleBudget(config.supabase, config.orgId, role)
    if (!budget.allowed) {
      toolBudgetOverrides.set(tool.id, { blocked: true, warning: false, role, result: budget })
      events.push({
        type: 'budget_blocked',
        data: { role, dailyUsed: budget.dailyUsed, dailyLimit: budget.dailyLimit },
      })
    } else if (budget.warning) {
      toolBudgetOverrides.set(tool.id, { blocked: false, warning: true, role, result: budget })
      events.push({
        type: 'budget_warning',
        data: {
          role,
          dailyUsed: budget.dailyUsed,
          dailyLimit: budget.dailyLimit,
          remainingTokens: budget.remainingTokens,
        },
      })
    }
  }

  // ── Per-execution token cap ──────────────────────────────────────────
  if (currentActiveRole && !config.skipCostGuard) {
    const cap = getExecutionTokenCap(currentActiveRole)
    if (cap && executionTokens > cap) {
      events.push({
        type: 'execution_cap_hit',
        data: { role: currentActiveRole, tokensUsed: executionTokens, cap },
      })
      executionCapHit = true
    }
  }

  // ── Parallel tool dispatch ───────────────────────────────────────────
  const toolExecutions = await Promise.allSettled(
    toolBlocks.map((tool) => {
      const override = toolBudgetOverrides.get(tool.id)
      if (override?.blocked) {
        // Return a synthetic budget-blocked result without calling the handler
        return Promise.resolve({
          success: false,
          error: override.result.reason || `Daily token budget for ${override.role} exhausted`,
        } as { success: boolean; data?: unknown; error?: string; queued?: boolean; approvalId?: string })
      }
      if (executionCapHit) {
        // Execution token cap hit -- skip remaining tool calls
        return Promise.resolve({
          success: false,
          error: `Per-execution token cap reached for ${currentActiveRole}. Provide your best answer with current information.`,
        } as { success: boolean; data?: unknown; error?: string; queued?: boolean; approvalId?: string })
      }
      return executeAgentTool(
        tool.name,
        tool.input as Record<string, unknown>,
        config.orgId,
        config.supabase,
        execOptions,
      )
    }),
  )

  // ── Process results ──────────────────────────────────────────────────
  for (let t = 0; t < toolBlocks.length; t++) {
    const tool = toolBlocks[t]
    const execution = toolExecutions[t]

    if (execution.status === 'rejected') {
      const errorMsg =
        execution.reason instanceof Error ? execution.reason.message : String(execution.reason)
      events.push({ type: 'tool_result', data: { name: tool.name, result: null, success: false } })
      events.push({
        type: 'stage',
        data: { stage: 'tool_execution', status: 'done', meta: { toolName: tool.name, success: false } },
      })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tool.id,
        content: `Tool execution failed: ${errorMsg}`,
        is_error: true,
      })
      continue
    }

    const result = execution.value
    try {
      // Extract citations from tool result
      try {
        const citations = extractCitationsFromToolResult(tool.name, result.data)
        if (citations && citations.length > 0) {
          events.push({ type: 'citation', data: { citations } })
        }

        // Also check for RAG citations from search_memory
        if ((!citations || citations.length === 0) && tool.name === 'search_memory') {
          try {
            const { extractRAGCitations } = await import('@/lib/agent/citation-extractor')
            const ragCitations = extractRAGCitations(tool.name, result.data)
            if (ragCitations.length > 0) {
              events.push({ type: 'citation', data: { citations: ragCitations } })
            }
          } catch {
            // Non-critical RAG citation extraction failure
            logger.debug('[engine] RAG citation extraction failed', { tool: tool.name })
          }
        }
      } catch {
        // Citation extraction failure should not block tool result processing
        logger.debug('[engine] Citation extraction failed for tool', { tool: tool.name })
      }

      events.push({
        type: 'tool_result',
        data: {
          name: tool.name,
          result: result.data,
          success: result.success,
          queued: result.queued,
          approvalId: result.approvalId,
        },
      })
      events.push({
        type: 'stage',
        data: {
          stage: 'tool_execution',
          status: 'done',
          meta: {
            toolName: tool.name,
            success: result.success,
            queued: result.queued,
            approvalId: result.approvalId,
          },
        },
      })

      // Fire-and-forget context write-back
      if (result.success && !result.queued) {
        reflectAction(
          config.supabase,
          config.orgId,
          tool.name,
          tool.input as Record<string, unknown>,
          result.data,
        ).catch((err) => logger.error('[engine] action reflect failed', { err, tool: tool.name }))
      }

      // Truncate tool results to prevent token overflow (200K API limit).
      // Large results from fetch_url/browse_website can blow the context window.
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tool.id,
        content: result.queued
          ? `Action queued for approval (ID: ${result.approvalId}). Confidence: ${(((result.data as any)?.confidence * 100) || 0).toFixed(0)}%`
          : result.success
            ? (() => {
                let data = JSON.stringify(result.data)
                if (data.length > MAX_TOOL_RESULT_CHARS) {
                  data =
                    data.slice(0, MAX_TOOL_RESULT_CHARS) +
                    '\n\n[Content truncated — ' +
                    (data.length - MAX_TOOL_RESULT_CHARS).toLocaleString() +
                    ' chars omitted]'
                }
                const jit = getJITInstruction(tool.name)
                return jit ? `${data}\n\n---\n${jit}` : data
              })()
            : `Error: ${result.error}`,
        is_error: !result.success && !result.queued,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      events.push({ type: 'tool_result', data: { name: tool.name, result: null, success: false } })
      events.push({
        type: 'stage',
        data: { stage: 'tool_execution', status: 'done', meta: { toolName: tool.name, success: false } },
      })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tool.id,
        content: `Tool execution failed: ${errorMsg}`,
        is_error: true,
      })
    }
  }

  return {
    toolResults,
    events,
    activeRole: currentActiveRole,
    executionCapHit,
  }
}
