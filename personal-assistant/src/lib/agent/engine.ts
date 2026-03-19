/**
 * Legacy re-export shim.
 * The engine has been rewritten to the TAOR pattern in ./engine/ directory.
 * This file exists for backwards compatibility with existing import paths.
 */
export { runTAORLoop as runAgentChat } from './engine/taor-loop'
export type { EngineConfig, AgentEvent, StageId, ChatMessage, ToolCallResult } from './engine/types'
