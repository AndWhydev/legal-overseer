/**
 * Swarm Orchestration Type System
 *
 * Defines the core types for multi-agent swarm coordination.
 * Swarms are DAGs of steps, each assigned to an agent role with
 * typed input/output contracts, personas, and capability boundaries.
 */

// ── Agent Roles ─────────────────────────────────────────────────────────────

export type AgentRole =
  | 'sales'
  | 'finance'
  | 'comms'
  | 'operations'
  | 'research'
  | 'coordinator'

/**
 * Agent persona defines HOW an agent behaves within a swarm.
 * Finance is conservative; Sales is optimistic. Tension produces better decisions.
 */
export interface AgentPersona {
  style: 'conservative' | 'balanced' | 'optimistic' | 'analytical'
  riskTolerance: number    // 0-1, how much risk the agent accepts
  priorityWeight: number   // 0-1, how much weight this agent's opinion carries in negotiations
  voice?: string           // prompt modifier for agent communication style
}

export const DEFAULT_PERSONAS: Record<AgentRole, AgentPersona> = {
  sales: {
    style: 'optimistic',
    riskTolerance: 0.7,
    priorityWeight: 0.6,
    voice: 'Focus on opportunities, client relationships, and revenue potential. Be proactive about growth.',
  },
  finance: {
    style: 'conservative',
    riskTolerance: 0.3,
    priorityWeight: 0.8,
    voice: 'Focus on financial accuracy, outstanding obligations, and risk. Flag overcommitment.',
  },
  comms: {
    style: 'balanced',
    riskTolerance: 0.5,
    priorityWeight: 0.5,
    voice: 'Focus on clear, professional communication. Consider tone and timing.',
  },
  operations: {
    style: 'analytical',
    riskTolerance: 0.4,
    priorityWeight: 0.7,
    voice: 'Focus on process efficiency, resource allocation, and operational readiness.',
  },
  research: {
    style: 'analytical',
    riskTolerance: 0.6,
    priorityWeight: 0.4,
    voice: 'Gather comprehensive information. Flag gaps in knowledge.',
  },
  coordinator: {
    style: 'balanced',
    riskTolerance: 0.5,
    priorityWeight: 1.0,
    voice: 'Orchestrate the team. Resolve conflicts. Ensure all agents contribute.',
  },
}

// ── Capability Boundaries ───────────────────────────────────────────────────

import type { ToolGroup } from '@/lib/agent/tools'

/**
 * Defines what tools an agent can use within a swarm step.
 * Finance can read invoices but can't send emails.
 * Comms can draft emails but can't approve payments.
 */
export interface CapabilityBoundary {
  allowedToolGroups: ToolGroup[]
  allowedSkills?: string[]          // skill IDs this role can activate
  deniedTools?: string[]         // specific tool names to block
  requiresApproval?: string[]    // tools that need approval even if auto-execute would normally apply
}

export const DEFAULT_CAPABILITIES: Record<AgentRole, CapabilityBoundary> = {
  sales: {
    allowedToolGroups: ['core', 'memory', 'channel'],
    allowedSkills: [
      'ad-scripts', 'tender-hunter', 'website-builder',
      'direct-response-copy', 'positioning-angles', 'lead-magnet', 'brand-voice',
    ],
    deniedTools: ['generate_invoice', 'send_email'],
  },
  finance: {
    allowedToolGroups: ['core', 'memory'],
    allowedSkills: [],
    deniedTools: ['send_email', 'send_sms', 'send_whatsapp'],
    requiresApproval: ['generate_invoice'],
  },
  comms: {
    allowedToolGroups: ['core', 'memory', 'channel', 'comms'],
    allowedSkills: [
      'ad-scripts', 'content-social',
      'email-sequences', 'newsletter', 'tweet-writer', 'brand-voice', 'content-atomizer',
      'creative-social-graphics', 'creative-brand-asset', 'creative-talking-head',
    ],
    deniedTools: ['generate_invoice'],
    requiresApproval: ['send_email', 'send_sms', 'send_whatsapp'],
  },
  operations: {
    allowedToolGroups: ['core', 'memory', 'channel'],
    allowedSkills: [
      'seo-visibility', 'content-social', 'tender-hunter',
      'seo-content', 'seo-strategy', 'keyword-research',
      'creative-product-video', 'creative-remotion-script-writer',
    ],
    deniedTools: ['send_email', 'generate_invoice'],
  },
  research: {
    allowedToolGroups: ['core', 'memory', 'web'],
    allowedSkills: [
      'seo-visibility', 'tender-hunter',
      'keyword-research', 'seo-strategy', 'positioning-angles',
      'creative-strategist',
    ],
    deniedTools: ['send_email', 'send_sms', 'generate_invoice', 'create_task'],
  },
  coordinator: {
    allowedToolGroups: ['core', 'memory'],
    allowedSkills: ['marketing-orchestrator', 'creative-orchestrator'],
    deniedTools: [],
  },
}

// ── Step Types ──────────────────────────────────────────────────────────────

export type StepType = 'agent' | 'parallel_group' | 'conditional' | 'sub_swarm'

export interface StepCondition {
  /** Which step's output to evaluate */
  sourceStep: string
  /** JSONPath expression to extract value from step output */
  path: string
  /** Comparison operator */
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists' | 'not_exists'
  /** Value to compare against */
  value: unknown
}

// ── Swarm Definition (Template Schema) ──────────────────────────────────────

export interface SwarmStepDefinition {
  key: string                   // unique identifier within swarm
  type: StepType
  label: string                 // human-readable name
  description?: string

  // Agent assignment
  agentRole: AgentRole
  persona?: Partial<AgentPersona>     // override default persona
  capabilities?: Partial<CapabilityBoundary>  // override default capabilities

  // Execution
  prompt: string                // instruction template (supports {{param}} substitution)
  modelTier?: 'classification' | 'conversation' | 'synthesis'  // defaults to conversation

  // Dependencies (step keys)
  dependsOn?: string[]

  // For conditional steps
  condition?: StepCondition

  // For parallel_group: which steps run in parallel
  parallelSteps?: string[]

  // For sub_swarm: template to invoke
  subSwarmSlug?: string

  // Governance
  requiresApproval?: boolean
  maxRetries?: number

  // Output contract: what this step produces
  outputSchema?: Record<string, string>  // key -> type description
}

export interface SwarmGovernance {
  /** Steps that require user approval before executing */
  approvalRequired: string[]
  /** Steps that should notify user but proceed */
  notifyOnComplete: string[]
  /** Maximum total cost before swarm pauses for approval */
  costCeiling?: number
  /** Maximum execution time (ms) before swarm is cancelled */
  timeoutMs?: number
  /** Escalation: model to use when agents negotiate */
  negotiationModel?: 'classification' | 'conversation' | 'synthesis'
}

export interface SwarmDefinition {
  version: '1.0'
  steps: SwarmStepDefinition[]
  governance: SwarmGovernance
  /** Input parameters the template expects */
  inputSchema: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'object'
    description: string
    required: boolean
    default?: unknown
  }>
}

// ── Database Row Types ──────────────────────────────────────────────────────

export type SwarmRunStatus =
  | 'pending'
  | 'planning'
  | 'executing'
  | 'negotiating'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'rolled_back'
  | 'cancelled'
  | 'running'

export type SwarmStepStatus =
  | 'pending'
  | 'ready'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'negotiating'
  | 'rolled_back'
  | 'blocked'

export type SwarmMessageType =
  | 'finding'
  | 'warning'
  | 'blocker'
  | 'handoff'
  | 'completion'
  | 'negotiation'
  | 'status'
  | 'conflict'
  | 'resolution'

export interface SwarmTemplateRow {
  id: string
  org_id: string
  name: string
  slug: string
  description: string | null
  category: string
  trigger_patterns: string[]
  definition: SwarmDefinition
  governance: SwarmGovernance
  parent_template_id: string | null
  total_runs: number
  success_runs: number
  avg_duration_ms: number | null
  avg_cost: number | null
  success_rate: number
  is_builtin: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SwarmRunRow {
  id: string
  org_id: string
  template_id: string | null
  template_slug: string | null
  trigger_type: string
  trigger_input: string
  trigger_params: Record<string, unknown>
  parent_run_id: string | null
  parent_step_id: string | null
  status: SwarmRunStatus
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  total_cost: number
  total_tokens_in: number
  total_tokens_out: number
  result_summary: string | null
  result_data: Record<string, unknown> | null
  error_message: string | null
  rollback_log: ReversibleAction[] | null
  rolled_back_at: string | null
  lock_key: number
  created_at: string
  updated_at: string
}

export interface SwarmStepRow {
  id: string
  run_id: string
  org_id: string
  step_key: string
  step_type: string
  agent_role: string | null
  persona: AgentPersona | null
  allowed_tools: string[] | null
  prompt: string | null
  input_data: Record<string, unknown>
  output_data: Record<string, unknown> | null
  depends_on: string[]
  condition: StepCondition | null
  status: SwarmStepStatus
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  cost_estimate: number
  tokens_in: number
  tokens_out: number
  model_used: string | null
  agent_run_id: string | null
  reversible_actions: ReversibleAction[] | null
  negotiation: NegotiationResult | null
  error_message: string | null
  retry_count: number
  max_retries: number
  created_at: string
  updated_at: string
}

export interface SwarmMessageRow {
  id: string
  run_id: string
  org_id: string
  from_step_key: string
  to_step_key: string | null
  message_type: SwarmMessageType
  content: string
  data: Record<string, unknown> | null
  resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
}

// ── Execution Types ─────────────────────────────────────────────────────────

export interface ReversibleAction {
  stepKey: string
  actionType: string           // e.g. 'create_task', 'send_email', 'generate_invoice'
  actionData: Record<string, unknown>  // data needed to undo
  undoStrategy: 'delete' | 'update' | 'archive' | 'manual'  // how to undo
  undoPayload?: Record<string, unknown>  // specific undo data
  executedAt: string
}

export interface NegotiationResult {
  agentRole: AgentRole
  originalRequest: string
  counterProposal: string
  reasoning: string
  suggestedAlternative?: Record<string, unknown>
  resolved: boolean
  resolution?: string
}

export interface SwarmStepResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
  messages?: Array<{
    type: SwarmMessageType
    content: string
    data?: Record<string, unknown>
  }>
  reversibleActions?: ReversibleAction[]
  negotiation?: NegotiationResult
  cost?: number
  tokensIn?: number
  tokensOut?: number
  modelUsed?: string
}

/**
 * SwarmParticipant interface — each agent in a swarm implements this.
 * The coordinator calls execute() with context and upstream findings.
 */
export interface SwarmParticipant {
  role: AgentRole
  persona: AgentPersona
  capabilities: CapabilityBoundary

  execute(
    prompt: string,
    context: SwarmStepContext,
  ): Promise<SwarmStepResult>
}

export interface SwarmStepContext {
  orgId: string
  runId: string
  stepKey: string
  inputData: Record<string, unknown>
  upstreamFindings: SwarmMessageRow[]
  triggerParams: Record<string, unknown>
  /** All completed step outputs available for reference */
  completedSteps: Record<string, Record<string, unknown>>
}

// ── Coordinator Types ───────────────────────────────────────────────────────

export interface CoordinatorClassification {
  templateSlug: string | null
  confidence: number
  extractedParams: Record<string, unknown>
  reasoning: string
}

export interface SwarmExecutionPlan {
  runId: string
  templateSlug: string
  steps: SwarmStepDefinition[]
  params: Record<string, unknown>
  estimatedCost: number
  estimatedDurationMs: number
}

// ── Events (for SSE streaming to dashboard) ─────────────────────────────────

export type SwarmEvent =
  | { type: 'swarm_started'; data: { runId: string; templateSlug: string; params: Record<string, unknown> } }
  | { type: 'step_started'; data: { runId: string; stepKey: string; agentRole: string } }
  | { type: 'step_completed'; data: { runId: string; stepKey: string; result: SwarmStepResult } }
  | { type: 'step_failed'; data: { runId: string; stepKey: string; error: string } }
  | { type: 'message_posted'; data: { runId: string; message: SwarmMessageRow } }
  | { type: 'negotiation_started'; data: { runId: string; stepKey: string; negotiation: NegotiationResult } }
  | { type: 'negotiation_resolved'; data: { runId: string; stepKey: string; resolution: string } }
  | { type: 'swarm_completed'; data: { runId: string; status: SwarmRunStatus; summary: string | null } }
  | { type: 'swarm_failed'; data: { runId: string; error: string } }
  | { type: 'rollback_started'; data: { runId: string } }
  | { type: 'rollback_completed'; data: { runId: string } }
  | { type: 'cost_update'; data: { runId: string; totalCost: number; stepKey: string; stepCost: number } }

// Aliases for component compatibility
export type SwarmRun = SwarmRunRow & {
  name?: string
  triggered_by?: string
  total_cost_cents?: number
}
export type SwarmStep = SwarmStepRow & {
  step_id?: string
  agent_type?: string
  error?: string | null
  output?: Record<string, unknown> | null
  cost_cents?: number
}
export type SwarmMessage = SwarmMessageRow & {
  from_step_id?: string
  to_step_id?: string | null
}

