/**
 * AI SDK v6 custom data types for BitBit's TAOR engine events.
 *
 * These types define the custom `data-*` parts that BitBit streams
 * alongside the standard AI SDK parts (text, reasoning, tool, source-url).
 * They enable typed access to plan stages, budget warnings, sub-agent
 * status, and other TAOR-specific events on the client.
 */

import type { UIMessage } from 'ai'

// ---------------------------------------------------------------------------
// Custom Data Types
// ---------------------------------------------------------------------------

/**
 * BitBit-specific data part schemas sent via `data-{name}` chunks.
 *
 * Each key becomes a `data-{key}` part type in the UI message stream.
 * For example, `plan` becomes a part with `type: 'data-plan'`.
 */
export type BitBitDataTypes = {
  /** Execution plan with ordered stages */
  plan: {
    stages: Array<{
      id: string
      label: string
      sublabel?: string
      icon: string
      toolHint?: string
    }>
  }

  /** Individual stage status update */
  plan_stage_update: {
    stageId: string
    status: 'active' | 'done' | 'error'
  }

  /** Pipeline stage lifecycle event */
  stage: {
    stage: string
    status: 'start' | 'done'
    meta?: Record<string, unknown>
  }

  /** Tool execution progress heartbeat */
  tool_progress: {
    callId: string
    name: string
    status: 'executing'
    elapsed_ms: number
  }

  /** Sub-agent lifecycle event */
  sub_agent: {
    agentId: string
    phase: 'start' | 'complete'
    description?: string
    summary?: string
  }

  /** Budget/cost enforcement events */
  budget: {
    type:
      | 'cost_blocked'
      | 'budget_blocked'
      | 'budget_warning'
      | 'execution_cap_hit'
    data: Record<string, unknown>
  }

  /** Thread resolution info (emitted before engine events) */
  thread: {
    threadId: string
    isNew: boolean
  }

  /** Checkpoint marker */
  checkpoint: {
    message_index: number
    label: string
  }

  /** Synthesis iteration start */
  synthesis: {
    iteration: number
  }

  /** Follow-up suggestions for the chat interface */
  follow_ups: {
    suggestions: string[]
  }
}

// ---------------------------------------------------------------------------
// Typed UIMessage
// ---------------------------------------------------------------------------

/**
 * A UIMessage parameterized with BitBit's custom data types.
 *
 * Use this on the client to get typed access to `message.parts`
 * including all `data-*` custom parts.
 */
export type BitBitUIMessage = UIMessage<Record<string, unknown>, BitBitDataTypes>
