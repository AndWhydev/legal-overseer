/**
 * @bitbit/core — Shared types and registries
 *
 * Currently exports: types + agent-registry
 * Future (Phase 4+): engine, model-router, orchestrator, tools, confidence, policies, channels
 */

// Agent registry
export {
  registerAgent,
  getAgent,
  listAgents,
  getRegisteredTypes,
  getAgentConfig,
  validateDefinition,
  type AgentDefinition,
} from './agent-registry'

// Types
export type {
  Organization,
  Contact,
  Lead,
  Invoice,
  Proposal,
  AgentConfig,
  AgentRun,
  AgentRegistryEntry,
  Watch,
  VoiceProfile,
  Template,
  OfferPackage,
} from './types'
