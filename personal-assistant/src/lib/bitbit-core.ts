/**
 * BitBit Core — Local barrel re-exporting shared types and registry functions.
 *
 * This file provides the @/lib/bitbit-core import path used throughout
 * personal-assistant. Types are re-exported from lib/core/.
 */

// Re-export types
export type {
  AgentType,
  AgentConfig,
  AgentRun,
  AgentRegistryEntry,
  AgentSchedule,
  ConfidenceThresholds,
  ConfidenceDecision,
  Organization,
  Contact,
  Lead,
  Invoice,
  Proposal,
  Watch,
  VoiceProfile,
  Template,
  OfferPackage,
  NotificationConfig,
  ChannelType,
  ChannelMessage,
  ChannelAdapter,
  CommunicationPatterns,
  AgentAction,
  InvoiceStatus,
  InvoiceLineItem,
  LeadStatus,
  LeadScore,
  ProposalStatus,
  ProposalTier,
  WatchStatus,
  OfferStatus,
  OrgSettings,
} from './core/types'

// Role engine types (added in Phase 20)
export type {
  RoleType,
  AutonomyLevel,
  RoleConfig,
  RoleState,
  WorkflowStatus,
  WorkflowStep,
  RoleWorkflow,
  ActivityType,
  RoleActivity,
  BISnapshot,
} from './bitbit-core/types'

export type { AgentDefinition } from './core/agent-registry'

// Re-export values (functions)
export {
  registerAgent,
  getAgent,
  listAgents,
  getRegisteredTypes,
  getAgentConfig,
  validateDefinition,
} from './core/agent-registry'
