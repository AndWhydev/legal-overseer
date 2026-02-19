/**
 * @bitbit/core — Shared types and registries
 *
 * Currently exports: types + agent-registry
 * Future (Phase 4+): engine, model-router, orchestrator, tools, confidence, policies, channels
 */

// Agent registry
export { registerAgent, getAgent, listAgents, type AgentDefinition } from './agent-registry'

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
