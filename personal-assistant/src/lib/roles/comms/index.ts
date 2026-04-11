/**
 * @bitbit/roles/comms -- Communications Role
 *
 * Wraps the existing channel triage and client comms agents as a domain role.
 * Importing this module triggers auto-registration via registerRole().
 */

// Import triggers registerRole() at module scope
import './comms-role'

// Re-exports
export { commsRole, getCommsState, type CommsState, type ToneProfile } from './comms-role'
export { runWrappedTriageTick, runWrappedCommsTick, type WrappedTriageTickResult, type WrappedCommsTickResult } from './triage-wrapper'
export { draftContextualResponse, batchDraftResponses, type ResponseDraftRequest, type ResponseDraftResult } from './response-drafter'
export { detectUnansweredThreads, type UnansweredThread, type SLAThresholds } from './follow-up-tracker'
export { monitorCommunicationFrequency, detectEngagementDrops, type CommunicationFrequency, type EngagementDrop, type CommsHealthStatus } from './relationship-monitor'
export { adaptDraft, learnClientTone, type ToneAdaptation } from './tone-adapter'
export { createEscalationWorkflow, getEscalationStepDefs, getEscalationStepDef, ESCALATION_SCHEDULE } from './escalation-workflow'
