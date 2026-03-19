// Primary exports
export { runTAORLoop, runTAORLoop as runAgentChat } from './taor-loop'

// Types
export type { EngineConfig, AgentEvent, StageId, ChatMessage, ToolCallResult } from './types'

// Sub-modules (for direct import when needed)
export { preFlightChecks, type PreFlightResult } from './pre-flight'
export { executeToolBatch, TOOL_ROLE_MAP, MAX_TOOL_RESULT_CHARS, type ToolExecutionResult } from './tool-executor'
