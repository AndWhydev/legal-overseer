import type { RoleType } from '@/lib/bitbit-core'
import type { RoleContext } from './role-runtime'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Each role type implements this interface.
 * The runtime calls evaluate() on each tick and hasChanges() for the
 * Haiku pre-screen cost-saving check.
 */
export interface RoleImplementation {
  type: RoleType
  name: string
  description: string

  /** Called during tick -- returns what the role wants to do. */
  evaluate(ctx: RoleContext): Promise<RoleEvaluation>

  /** Called to check if anything changed since last tick (Haiku pre-screen). */
  hasChanges(ctx: RoleContext): Promise<boolean>

  /** Default config values for new org enablement. */
  defaultConfig(): Partial<{
    config: Record<string, unknown>
    tick_interval_seconds: number
    daily_budget_cents: number
    autonomy_level: string
  }>
}

/**
 * Result of a role evaluation -- actions to take, insights to surface,
 * state mutations, and workflows to start.
 */
export interface RoleEvaluation {
  actions: RoleAction[]
  insights: RoleInsight[]
  stateUpdates: Record<string, unknown>
  workflowsToStart: WorkflowDefinition[]
}

export interface RoleAction {
  type: string
  summary: string
  payload: Record<string, unknown>
  confidence: number
  reversible: boolean
}

export interface RoleInsight {
  summary: string
  details: Record<string, unknown>
  priority: 'high' | 'medium' | 'low'
}

export interface WorkflowDefinition {
  workflowType: string
  steps: Array<{
    stepId: string
    name: string
  }>
  context: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const roleImplementations = new Map<RoleType, RoleImplementation>()

/**
 * Register a role implementation. Typically called at module load time.
 * Overwrites any existing registration for the same type.
 */
export function registerRole(impl: RoleImplementation): void {
  roleImplementations.set(impl.type, impl)
}

/**
 * Get a registered role implementation by type.
 */
export function getRole(type: RoleType): RoleImplementation | undefined {
  return roleImplementations.get(type)
}

/**
 * List all registered role implementations.
 */
export function listRoles(): RoleImplementation[] {
  return Array.from(roleImplementations.values())
}

/**
 * Get all registered role types.
 */
export function getRegisteredRoleTypes(): RoleType[] {
  return Array.from(roleImplementations.keys())
}
