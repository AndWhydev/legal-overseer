/**
 * @bitbit/core
 *
 * Core engine exports for the BitBit agentic platform.
 *
 * Architecture:
 *   Message → Model Router → Agentic Loop → Tool Execution → Confidence Routing → Act/Ask/Escalate
 *
 * Migration note:
 *   Engine, model-router, orchestrator, tools, and channel pipeline
 *   are migrating from personal-assistant/src/lib/agent/ into this package.
 *   During transition, personal-assistant imports from here.
 */

// Engine
export { runAgentChat, type EngineConfig, type AgentEvent } from './engine'

// Model routing
export { routeToModel, getModel, type ModelTier } from './model-router'

// Orchestrator
export { orchestrate, type OrchestratorTask, type OrchestratorResult } from './orchestrator'

// Tool system
export { getAgentTools, executeAgentTool, type ToolDefinition } from './tools'

// Confidence routing
export { routeByConfidence, type ConfidenceDecision } from './confidence'

// Policy engine
export { loadPolicies, evaluatePolicy, type PolicyPack } from './policies'

// Agent registry
export { registerAgent, getAgent, listAgents, type AgentDefinition } from './agent-registry'

// Channel synthesis
export { synthesize, type ChannelAdapter, type ChannelMessage } from './channels'

// Types
export type {
  Organization,
  Contact,
  Lead,
  Invoice,
  Proposal,
  AgentConfig,
  AgentRun,
  Watch,
  VoiceProfile,
  Template,
  OfferPackage,
} from './types'
