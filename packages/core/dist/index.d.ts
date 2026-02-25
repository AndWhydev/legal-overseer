/**
 * @bitbit/core — Shared types and registries
 *
 * Currently exports: types + agent-registry
 * Future (Phase 4+): engine, model-router, orchestrator, tools, confidence, policies, channels
 */
export { registerAgent, getAgent, listAgents, getRegisteredTypes, getAgentConfig, validateDefinition, type AgentDefinition, } from './agent-registry';
export type { AgentType, Organization, Contact, Lead, Invoice, Proposal, AgentConfig, AgentRun, AgentRegistryEntry, Watch, VoiceProfile, Template, OfferPackage, ConfidenceThresholds, ConfidenceDecision, ModelTier, OrgSettings, NotificationConfig, AgentSchedule, AgentAction, InvoiceStatus, InvoiceLineItem, LeadStatus, LeadScore, ProposalStatus, ProposalTier, WatchStatus, OfferStatus, ChannelType, ChannelMessage, ChannelAdapter, CommunicationPatterns, } from './types';
//# sourceMappingURL=index.d.ts.map