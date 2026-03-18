/**
 * Agent Swarm — Core type definitions.
 *
 * Swarms are multi-agent orchestration units. A swarm is defined by a DAG
 * of steps, each handled by a participant (agent/role). Steps can be
 * parallel, sequential, or conditional. Agents communicate via a message bus.
 */

// ---------------------------------------------------------------------------
// DAG Shape — defines the swarm blueprint
// ---------------------------------------------------------------------------

export interface SwarmDAG {
  /** Unique agents participating in this swarm */
  agents: SwarmAgent[]
  /** Steps in the execution graph */
  steps: SwarmStepDef[]
  /** Global swarm-level config */
  config?: {
    max_duration_seconds?: number
    budget_cents?: number
    allow_parallel?: boolean
    conflict_resolution?: 'coordinator' | 'voting' | 'first_wins'
  }
}

export interface SwarmAgent {
  id: string
  agent_type: string  // maps to existing agent types or role types
  label: string
  model_tier?: 'haiku' | 'sonnet' | 'opus'
  config?: Record<string, unknown>
}

export interface SwarmStepDef {
  step_id: string
  agent_id: string  // references SwarmAgent.id
  name: string
  step_type: 'parallel' | 'sequential' | 'conditional'
  /** Step IDs that must complete before this step */
  depends_on: string[]
  /** For conditional steps: expression evaluated against prior step outputs */
  condition?: SwarmCondition
  /** Expected input keys from upstream steps */
  input_mapping?: Record<string, string>  // local_key → "step_id.output_key"
  /** What this step should produce */
  expected_output?: string[]
  /** Instructions for the agent */
  prompt_template?: string
  /** Max duration for this step in seconds */
  timeout_seconds?: number
}

export interface SwarmCondition {
  /** The step output to check */
  source: string   // "step_id.output_key"
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'truthy' | 'falsy'
  value?: unknown
}

// ---------------------------------------------------------------------------
// Template — reusable swarm patterns
// ---------------------------------------------------------------------------

export interface SwarmTemplate {
  id: string
  slug: string
  name: string
  description: string | null
  category: string
  dag: SwarmDAG
  param_schema: Record<string, SwarmParamDef>
  trigger_patterns: string[]
  is_builtin: boolean
  org_id: string | null
  usage_count: number
  created_at: string
  updated_at: string
}

export interface SwarmParamDef {
  type: 'string' | 'number' | 'boolean' | 'object'
  description: string
  required: boolean
  default?: unknown
}

// ---------------------------------------------------------------------------
// Definition — org-specific instantiation of a template
// ---------------------------------------------------------------------------

export interface SwarmDefinition {
  id: string
  org_id: string
  name: string
  description: string | null
  dag: SwarmDAG
  input_schema: Record<string, SwarmParamDef>
  output_schema: Record<string, SwarmParamDef>
  template_id: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Run — execution instance
// ---------------------------------------------------------------------------

export type SwarmRunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'rolling_back'

export interface SwarmRun {
  id: string
  org_id: string
  definition_id: string | null
  template_id: string | null
  name: string
  status: SwarmRunStatus
  input_params: Record<string, unknown>
  output: Record<string, unknown>
  dag_snapshot: SwarmDAG
  total_cost_cents: number
  total_tokens_in: number
  total_tokens_out: number
  triggered_by: string
  trigger_input: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Step — individual step execution
// ---------------------------------------------------------------------------

export type SwarmStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'rolled_back'

export interface SwarmStep {
  id: string
  swarm_run_id: string
  org_id: string
  step_id: string
  step_type: 'parallel' | 'sequential' | 'conditional'
  agent_type: string
  status: SwarmStepStatus
  input: Record<string, unknown>
  output: Record<string, unknown>
  condition: SwarmCondition | null
  rollback_action: Record<string, unknown> | null
  cost_cents: number
  tokens_in: number
  tokens_out: number
  error: string | null
  execution_order: number
  depends_on: string[]
  started_at: string | null
  completed_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Message — inter-agent communication
// ---------------------------------------------------------------------------

export type SwarmMessageType = 'finding' | 'request' | 'response' | 'conflict' | 'resolution' | 'status'

export interface SwarmMessage {
  id: string
  swarm_run_id: string
  org_id: string
  from_step_id: string
  to_step_id: string | null  // null = broadcast
  message_type: SwarmMessageType
  content: Record<string, unknown>
  created_at: string
}

// ---------------------------------------------------------------------------
// Participant Interface — what each agent must implement
// ---------------------------------------------------------------------------

export interface SwarmContext {
  /** The current swarm run */
  run: SwarmRun
  /** The current step being executed */
  step: SwarmStep
  /** The step definition from the DAG */
  stepDef: SwarmStepDef
  /** Input from upstream steps and swarm params */
  input: Record<string, unknown>
  /** Findings shared by other agents in this swarm */
  findings: SwarmMessage[]
  /** Org ID */
  orgId: string
}

export interface SwarmResult {
  success: boolean
  /** Output data from this step */
  output: Record<string, unknown>
  /** Messages to share with other agents */
  messages?: Array<{
    to_step_id?: string  // null = broadcast
    message_type: SwarmMessageType
    content: Record<string, unknown>
  }>
  /** If this action can be rolled back, describe how */
  rollback_action?: Record<string, unknown>
  /** Cost of this step */
  cost_cents?: number
  tokens_in?: number
  tokens_out?: number
  /** Error message if failed */
  error?: string
}

export interface SwarmParticipant {
  /** The agent type this participant handles */
  agent_type: string
  /** Execute a swarm step */
  execute(context: SwarmContext): Promise<SwarmResult>
  /** Optional: roll back a completed step */
  rollback?(context: SwarmContext): Promise<{ success: boolean; error?: string }>
}

// ---------------------------------------------------------------------------
// Coordinator types
// ---------------------------------------------------------------------------

export interface SwarmTriggerResult {
  matched: boolean
  template?: SwarmTemplate
  params?: Record<string, unknown>
  confidence: number
  reasoning: string
}

export interface ConflictResolutionInput {
  swarm_run_id: string
  conflicting_steps: Array<{
    step_id: string
    agent_type: string
    output: Record<string, unknown>
    reasoning: string
  }>
  context: Record<string, unknown>
}

export interface ConflictResolutionResult {
  resolution: Record<string, unknown>
  reasoning: string
  chosen_step_id?: string
}
