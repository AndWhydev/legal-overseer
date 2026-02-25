/**
 * BitBit Core — Local barrel re-exporting shared types and registry functions.
 *
 * This file provides the @/lib/bitbit-core import path used throughout
 * personal-assistant. Types are re-exported from packages/core/src.
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
  ModelTier,
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
} from '../../../packages/core/src/types'

export type { AgentDefinition } from '../../../packages/core/src/agent-registry'

// Re-export values (functions)
export {
  registerAgent,
  getAgent,
  listAgents,
  getRegisteredTypes,
  getAgentConfig,
  validateDefinition,
} from '../../../packages/core/src/agent-registry'
