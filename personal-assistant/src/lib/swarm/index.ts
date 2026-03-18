/**
 * Agent Swarm — barrel export.
 */

// Types
export type {
  SwarmDAG,
  SwarmAgent,
  SwarmStepDef,
  SwarmCondition,
  SwarmTemplate,
  SwarmParamDef,
  SwarmDefinition,
  SwarmRun,
  SwarmRunStatus,
  SwarmStep,
  SwarmStepStatus,
  SwarmMessage,
  SwarmMessageType,
  SwarmContext,
  SwarmResult,
  SwarmParticipant,
  SwarmTriggerResult,
  ConflictResolutionInput,
  ConflictResolutionResult,
} from './types'

// Participant registry
export {
  registerParticipant,
  getParticipant,
  listParticipantTypes,
} from './participant-registry'

// Executor
export {
  createSwarmRun,
  executeSwarmRun,
  rollbackSwarmRun,
  cancelSwarmRun,
  topologicalLayers,
} from './executor'

// Coordinator
export {
  loadTemplates,
  matchTemplate,
  resolveParams,
  triggerSwarm,
  resolveConflict,
} from './coordinator'

// Participants
export { registerBuiltinParticipants } from './participants'
