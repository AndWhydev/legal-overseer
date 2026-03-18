/**
 * @bitbit/roles — Role Engine Runtime
 *
 * Manages role lifecycle: state persistence, tick execution,
 * concurrency control, scheduling, and initialization.
 */

// Runtime
export {
  executeRoleTick,
  loadRoleState,
  saveRoleState,
  acquireRoleLock,
  releaseRoleLock,
  type RoleTickResult,
  type RoleContext,
} from './role-runtime'

// Registry
export {
  registerRole,
  getRole,
  listRoles,
  getRegisteredRoleTypes,
  type RoleImplementation,
  type RoleEvaluation,
  type RoleAction,
  type RoleInsight,
  type WorkflowDefinition,
} from './role-registry'

// Scheduler
export { runScheduledRoles } from './role-scheduler'

// Initialization
export {
  initializeRole,
  disableRole,
  type InitializeRoleResult,
  type DisableRoleResult,
} from './role-init'

// Autonomy Gate
export {
  routeThroughAutonomyGate,
  type GateDecision,
  type GateResult,
} from './autonomy-gate'

// Action Dispatcher
export {
  dispatchRoleAction,
  dispatchRoleActions,
  type DispatchResult,
} from './action-dispatcher'

// Output Formatter
export { formatActivityForAutonomy } from './output-formatter'
