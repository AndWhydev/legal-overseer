/**
 * Agent Engine — extracted modules.
 *
 * Re-exports shared types, pre-flight checks, and tool executor
 * so consumers can import from `@/lib/agent/engine`.
 */

// Types
export type { EngineConfig, StageId, AgentEvent } from './types'

// Pre-flight
export { preFlightChecks } from './pre-flight'
export type { PreFlightResult } from './pre-flight'

// Tool executor
export { executeToolBatch, TOOL_ROLE_MAP, MAX_TOOL_RESULT_CHARS } from './tool-executor'
export type { ToolExecutionResult } from './tool-executor'
