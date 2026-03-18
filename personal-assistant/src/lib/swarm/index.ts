/**
 * Swarm Orchestration Module
 *
 * Multi-agent coordination system for BitBit.
 * Enables complex operations through coordinated agent teams.
 */

export { SwarmCoordinator } from './coordinator'
export { SwarmExecutor, rollbackSwarm } from './executor'
export { SwarmAgent } from './agent'
export { BUILTIN_TEMPLATES, matchTemplate } from './templates'
export type {
  // Core types
  AgentRole,
  AgentPersona,
  CapabilityBoundary,
  StepType,
  StepCondition,
  SwarmStepDefinition,
  SwarmGovernance,
  SwarmDefinition,

  // DB row types
  SwarmRunStatus,
  SwarmStepStatus,
  SwarmMessageType,
  SwarmTemplateRow,
  SwarmRunRow,
  SwarmStepRow,
  SwarmMessageRow,

  // Execution types
  ReversibleAction,
  NegotiationResult,
  SwarmStepResult,
  SwarmParticipant,
  SwarmStepContext,

  // Coordinator types
  CoordinatorClassification,
  SwarmExecutionPlan,

  // Events
  SwarmEvent,
} from './types'
