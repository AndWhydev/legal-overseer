/**
 * Agent Engine Hooks
 *
 * Composable guardrail pipeline inspired by the Anthropic Agent SDK hooks pattern.
 * Hooks intercept tool calls before/after execution and final responses,
 * without consuming context window tokens.
 *
 * Hook types:
 * - PreToolUse:  runs before each tool call. Can deny, modify input, or inject context.
 * - PostToolUse: runs after each tool call. Can scrub output, log, or trigger side effects.
 * - PreResponse: runs before the final response is returned to the user.
 *
 * Hooks are registered per-engine instance and run in order. A denied PreToolUse
 * short-circuits execution for that tool.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { EngineConfig, AgentEvent } from './types'
import type { ToolResult } from '@/lib/agent/tools'

// ─── Hook Types ─────────────────────────────────────────────────────────────

export interface PreToolUseInput {
  toolName: string
  toolId: string
  input: Record<string, unknown>
  config: EngineConfig
  executionTokens: number
}

export interface PreToolUseOutput {
  /** Deny this tool call with a reason (returned as tool error to Claude). */
  deny?: string
  /** Override tool input before execution. */
  modifiedInput?: Record<string, unknown>
  /** Inject a system message after the tool result (invisible to user). */
  systemMessage?: string
}

export interface PostToolUseInput {
  toolName: string
  toolId: string
  input: Record<string, unknown>
  result: ToolResult
  config: EngineConfig
}

export interface PostToolUseOutput {
  /** Additional context appended to the tool result (invisible to user). */
  additionalContext?: string
  /** Side-effect events to emit. */
  events?: AgentEvent[]
}

export interface PreResponseInput {
  text: string
  config: EngineConfig
}

export interface PreResponseOutput {
  /** Transformed text to return instead. */
  text: string
}

export type PreToolUseHook = (input: PreToolUseInput) => Promise<PreToolUseOutput>
export type PostToolUseHook = (input: PostToolUseInput) => Promise<PostToolUseOutput>
export type PreResponseHook = (input: PreResponseInput) => Promise<PreResponseOutput>

export interface HookConfig {
  /** Tool name pattern to match (regex string). Omit to match all tools. */
  matcher?: string
  hook: PreToolUseHook | PostToolUseHook | PreResponseHook
  /** If true, hook runs async and doesn't block the pipeline. */
  fireAndForget?: boolean
}

export interface EngineHooks {
  preToolUse: HookConfig[]
  postToolUse: HookConfig[]
  preResponse: HookConfig[]
}

// ─── Hook Runner ────────────────────────────────────────────────────────────

function matchesTool(matcher: string | undefined, toolName: string): boolean {
  if (!matcher) return true
  return new RegExp(matcher).test(toolName)
}

/**
 * Run all PreToolUse hooks for a given tool call.
 * Returns the first deny if any hook denies, otherwise merged output.
 */
export async function runPreToolUseHooks(
  hooks: HookConfig[],
  input: PreToolUseInput,
): Promise<PreToolUseOutput> {
  let merged: PreToolUseOutput = {}

  for (const { matcher, hook, fireAndForget } of hooks) {
    if (!matchesTool(matcher, input.toolName)) continue

    if (fireAndForget) {
      ;(hook as PreToolUseHook)(input).catch(() => {})
      continue
    }

    const result = await (hook as PreToolUseHook)(input)
    if (result.deny) return result // short-circuit on deny
    if (result.modifiedInput) merged.modifiedInput = result.modifiedInput
    if (result.systemMessage) merged.systemMessage = result.systemMessage
  }

  return merged
}

/**
 * Run all PostToolUse hooks for a given tool result.
 * Merges additional context and collects events.
 */
export async function runPostToolUseHooks(
  hooks: HookConfig[],
  input: PostToolUseInput,
): Promise<PostToolUseOutput> {
  const allEvents: AgentEvent[] = []
  const contextParts: string[] = []

  for (const { matcher, hook, fireAndForget } of hooks) {
    if (!matchesTool(matcher, input.toolName)) continue

    if (fireAndForget) {
      ;(hook as PostToolUseHook)(input).catch(() => {})
      continue
    }

    const result = await (hook as PostToolUseHook)(input)
    if (result.additionalContext) contextParts.push(result.additionalContext)
    if (result.events) allEvents.push(...result.events)
  }

  return {
    additionalContext: contextParts.length > 0 ? contextParts.join('\n') : undefined,
    events: allEvents.length > 0 ? allEvents : undefined,
  }
}

/**
 * Run all PreResponse hooks on the final text.
 * Pipes text through each hook sequentially.
 */
export async function runPreResponseHooks(
  hooks: HookConfig[],
  input: PreResponseInput,
): Promise<PreResponseOutput> {
  let text = input.text

  for (const { hook, fireAndForget } of hooks) {
    if (fireAndForget) {
      ;(hook as PreResponseHook)({ ...input, text }).catch(() => {})
      continue
    }

    const result = await (hook as PreResponseHook)({ ...input, text })
    text = result.text
  }

  return { text }
}

// ─── Built-in Hooks ─────────────────────────────────────────────────────────

import { checkRoleBudget } from '@/lib/agent/cost-guard'
import { guardAndHumanize, detectLeak } from '@/lib/agent/response-guard'
import { reflectAction } from '@/lib/context/action-reflector'
import { logger } from '@/lib/core/logger'

/** Maps growth tool names to their budget role. */
const TOOL_ROLE_MAP: Record<string, string> = {
  generate_ad_scripts: 'ads', list_ad_batches: 'ads', adapt_script: 'ads',
  audit_visibility: 'seo', generate_seo_content: 'seo', generate_schema_markup: 'seo', visibility_report: 'seo',
  schedule_post: 'content', generate_blog: 'content', content_calendar: 'content',
  search_tenders: 'tenders', score_tender: 'tenders', generate_tender_response: 'tenders',
}

/**
 * Budget guard: denies growth tools when role budget is exhausted.
 */
export const budgetGuardHook: PreToolUseHook = async (input) => {
  const role = TOOL_ROLE_MAP[input.toolName]
  if (!role || input.config.skipCostGuard) return {}

  const budget = await checkRoleBudget(input.config.supabase, input.config.orgId, role)
  if (!budget.allowed) {
    return { deny: budget.reason || `Daily budget for ${role} exhausted` }
  }
  return {}
}

/**
 * Leak scrubber: appends a reminder after every tool result to stay in character.
 */
export const leakScrubberHook: PostToolUseHook = async () => {
  return {
    additionalContext: '[Reminder: You are BitBit. Never mention Claude, Anthropic, or OpenAI.]',
  }
}

/**
 * Action reflector: fire-and-forget context write-back after successful tool calls.
 */
export const actionReflectorHook: PostToolUseHook = async (input) => {
  if (!input.result.success || input.result.queued) return {}

  reflectAction(
    input.config.supabase,
    input.config.orgId,
    input.toolName,
    input.input,
    input.result.data,
  ).catch((err) => logger.error('[hook:reflect] action reflect failed', { err, tool: input.toolName }))

  return {}
}

/**
 * Humanizer: applies SOUL.md voice rules and leak scrubbing to final response.
 */
export const humanizeResponseHook: PreResponseHook = async (input) => {
  const humanized = guardAndHumanize(input.text)
  const leak = detectLeak(input.text)
  if (leak.leaked) {
    logger.warn('[hook:humanize] response_leak_detected', { patterns: leak.patterns })
  }
  return { text: humanized }
}

// ─── Default Hook Set ───────────────────────────────────────────────────────

/**
 * Returns the default hook configuration for the BitBit agent engine.
 * All existing guardrails as composable hooks.
 */
export function createDefaultHooks(): EngineHooks {
  return {
    preToolUse: [
      { hook: budgetGuardHook, matcher: Object.keys(TOOL_ROLE_MAP).join('|') },
    ],
    postToolUse: [
      { hook: leakScrubberHook },
      { hook: actionReflectorHook, fireAndForget: true },
    ],
    preResponse: [
      { hook: humanizeResponseHook },
    ],
  }
}
