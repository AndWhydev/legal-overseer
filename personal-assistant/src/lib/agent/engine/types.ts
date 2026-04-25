/**
 * Shared types for the TAOR agent engine.
 *
 * These types are used by the engine loop and all extracted modules
 * (pre-flight, tool-executor, etc.). Keeping them in one place avoids
 * circular imports and makes the contract between modules explicit.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlanStage } from '@/lib/agent/planner'

// ---------------------------------------------------------------------------
// Engine Configuration
// ---------------------------------------------------------------------------

export interface EngineConfig {
  orgId: string
  supabase: SupabaseClient
  model?: string
  maxIterations?: number
  /** Agent config ID for run logging. If omitted, run logging is skipped. */
  agentConfigId?: string
  /** Skip cost guard check (e.g. for interactive chat vs background agents). */
  skipCostGuard?: boolean
  /** Agent type for confidence routing defaults (e.g. 'lead-swarm', 'invoice-flow'). */
  agentType?: string
  /** Organization settings for confidence thresholds. */
  orgSettings?: { confidence_thresholds?: { act?: number; ask?: number } }
  /** Calibrated thresholds (loaded from agent_configs, computed by calibration cron). */
  calibratedThresholds?: { act: number; ask: number; sampleSize: number } | null
  /** Pre-loaded conversation history to prepend to the messages array. */
  history?: Anthropic.MessageParam[]
  /** User ID for thread ownership and context assembly. */
  userId?: string
  /** Thread ID for conversation history loading via ContextAssembler. */
  threadId?: string
  /** User's email address for identity anchoring in the system prompt. */
  userEmail?: string
  /** User's display name for identity anchoring in the system prompt. */
  userDisplayName?: string
  /** User's IANA timezone (e.g. 'Australia/Brisbane'). Used to render dates in the system prompt. */
  userTimezone?: string | null
  /** Channel the message arrived from (web, sendblue, telegram, whatsapp). */
  channel?: 'web' | 'sendblue' | 'telegram' | 'whatsapp'
  /** Multimodal content blocks from file attachments (images, PDFs, documents).
   *  When present, the user message is sent as ContentBlockParam[] instead of string. */
  contentBlocks?: Anthropic.ContentBlockParam[]
  /** Parent agent ID when running as a sub-agent (for tracing). */
  parentAgentId?: string
  /** Maximum nesting depth for sub-agent spawning. */
  maxDepth?: number
  /** Target entity ID for delegation mandate and LTV lookup. */
  entityId?: string
  /** Resolved delegation mandate from entity_overrides table. */
  delegationMandate?: 'infinite_autopilot' | 'supervised' | 'standard'
  /** LTV multiplier for cost budget scaling (default 1.0, max 10.0). */
  ltvMultiplier?: number
  /** Token budget preset — 'dynamic_workspace' for 200K+ context. */
  budgetPreset?: 'standard' | 'dynamic_workspace'
  /** Explicit iteration cap override from entity_overrides (overrides SAFETY_CEILING). */
  iterationCap?: number
  /** Abort signal for cancelling an in-flight TAOR run (e.g. voice barge-in).
   *  Checked at loop boundaries between iterations; does not forcibly kill the
   *  current Anthropic stream, but prevents subsequent iterations. */
  abortSignal?: AbortSignal
  /** Voice mode: the caller is a realtime voice session. When true, the model
   *  is biased toward short spoken responses and voice-unfriendly formatting
   *  (tables, code fences, long bullet lists) is discouraged. */
  voiceMode?: boolean
  /**
   * Current dashboard mode (chat | inbox | work | money).
   * When present, the matching ModePersona fragment is appended to the system
   * prompt and retrievalBias is passed to the RAG layer.
   * Mode is a prior, not a wall — cross-mode retrieval is not blocked.
   * Undefined/invalid values fall back to DEFAULT_PERSONA (no-op).
   */
  currentMode?: string
}

// ---------------------------------------------------------------------------
// Stage Identifier
// ---------------------------------------------------------------------------

export type StageId = 'cost_check' | 'model_routing' | 'context_assembly' | 'api_streaming' | 'tool_execution'

// ---------------------------------------------------------------------------
// Agent Events (yielded by the engine generator)
// ---------------------------------------------------------------------------

export type AgentEvent =
  | { type: 'thinking'; data: string }
  | { type: 'thinking_start'; data: Record<string, never> }
  | { type: 'thinking_delta'; data: string }
  | { type: 'thinking_complete'; data: { duration_ms: number } }
  | { type: 'stage'; data: { stage: StageId; status: 'start' | 'done'; meta?: Record<string, unknown> } }
  | { type: 'plan'; data: { stages: PlanStage[] } }
  | { type: 'plan_stage_update'; data: { stageId: string; status: 'active' | 'done' | 'error' } }
  | { type: 'tool_call'; data: { callId: string; name: string; input: unknown } }
  | {
      type: 'tool_result'
      data: {
        callId: string
        name: string
        result: unknown
        success: boolean
        queued?: boolean
        approvalId?: string
      }
    }
  | { type: 'content_delta'; data: string }
  | { type: 'message'; data: string }
  | { type: 'error'; data: string }
  | { type: 'cost_blocked'; data: { spentToday: number; dailyLimit: number } }
  | { type: 'budget_blocked'; data: { role: string; dailyUsed: number; dailyLimit: number } }
  | { type: 'budget_warning'; data: { role: string; dailyUsed: number; dailyLimit: number; remainingTokens: number } }
  | { type: 'execution_cap_hit'; data: { role: string; tokensUsed: number; cap: number } }
  | { type: 'citation'; data: { citations: Array<{ index: number; url: string; title: string; description?: string }> } }
  | { type: 'checkpoint'; data: { message_index: number; label: string } }
  | { type: 'sub_agent_start'; data: { agentId: string; description: string } }
  | { type: 'sub_agent_complete'; data: { agentId: string; summary: string } }
  | { type: 'tool_progress'; data: { callId: string; name: string; status: 'executing'; elapsed_ms: number } }
  | { type: 'synthesis_start'; data: { iteration: number } }
  | { type: 'follow_ups'; data: { suggestions: string[] } | string[] }
  | { type: 'done'; data: unknown }

// ---------------------------------------------------------------------------
// Legacy types (used by orchestrator.ts and other consumers)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallResult[]
}

export interface ToolCallResult {
  name: string
  input: Record<string, unknown>
  result: unknown
  success: boolean
}

// ---------------------------------------------------------------------------
// Tier system re-exports
//
// The tier context injection design:
// 1. reliability-tracker records per-service, per-tier execution outcomes
// 2. tool-resolver reads aggregated reliability data and formats it into a
//    system prompt block (buildTierContextBlock) during TAOR pre-flight
// 3. The model uses this context to select the optimal execution tier
// 4. After tool dispatch, tool-executor calls recordToolOutcome to close
//    the feedback loop
// ---------------------------------------------------------------------------

export type { ExecutionRecord, ReliabilitySummary } from './reliability-tracker'
export type { TierType } from './tool-resolver'
