/**
 * @bitbit/roles/sales -- Sales Role
 *
 * Wraps the existing lead swarm, proposal bot, and client onboarding agents
 * as a domain role. Importing this module triggers auto-registration via registerRole().
 */

// Import triggers registerRole() at module scope
import './sales-role'

// Re-exports
export { salesRole, getSalesState, type SalesState } from './sales-role'
export { runWrappedLeadTick, type WrappedLeadTickResult } from './lead-wrapper'
export {
  runWrappedProposalTick,
  fetchPricingContext,
  generateProposalWithContext,
  type WrappedProposalTickResult,
  type ProposalWithContext,
  type PricingContextItem,
} from './proposal-generator'
export {
  checkStaleLeads,
  checkStaleProposals,
  createNurtureWorkflow,
  getNurtureStepDefs,
  getNurtureStepDef,
  NURTURE_SCHEDULE,
  type StaleLead,
  type StaleProposal,
} from './lead-nurture'
export {
  checkNewConversions,
  createOnboardingWorkflow,
  getOnboardingStepDefs,
  getOnboardingStepDef,
  type ConversionEvent,
} from './client-onboarding'
export {
  analyzeWinLossPatterns,
  type WinLossResult,
  type WinLossLearning,
} from './win-loss-learner'
export {
  computePipelineSnapshot,
  type PipelineSnapshot,
  type PipelineAlert,
} from './pipeline-tracker'
