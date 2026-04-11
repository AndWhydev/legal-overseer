import { z } from 'zod'
import type { ToolGroup } from '@/lib/agent/tools'

// ---------------------------------------------------------------------------
// Supported Events
// ---------------------------------------------------------------------------

export const SUPPORTED_EVENTS = [
  'new_message',
  'new_lead',
  'invoice_overdue',
  'invoice_paid',
  'new_contact',
  'schedule',
] as const

export type SupportedEvent = (typeof SUPPORTED_EVENTS)[number]

// ---------------------------------------------------------------------------
// Core Interfaces
// ---------------------------------------------------------------------------

export interface WorkflowTrigger {
  type: 'event' | 'schedule' | 'condition'
  event?: string
  schedule?: { cron?: string; interval_seconds?: number }
  condition?: { field: string; operator: string; value: unknown }
}

export interface WorkflowCondition {
  field: string
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt'
  value: unknown
}

export interface WorkflowAction {
  step_id: string
  name: string
  tool_group: ToolGroup
  tool_name: string
  parameters: Record<string, unknown>
  delay_seconds?: number
  condition?: string
  on_failure?: 'skip' | 'abort' | 'retry'
}

export interface WorkflowRule {
  id: string
  org_id: string
  name: string
  description: string
  trigger: WorkflowTrigger
  conditions: WorkflowCondition[]
  actions: WorkflowAction[]
  enabled: boolean
  created_by: string
  last_triggered_at: string | null
  trigger_count: number
  created_at: string
  updated_at: string
}

export interface WorkflowEvent {
  event: string
  data: Record<string, unknown>
  source_id?: string
  triggered_by_workflow?: boolean
}

// ---------------------------------------------------------------------------
// Zod Schemas (for validating LLM output)
// ---------------------------------------------------------------------------

const TOOL_GROUP_VALUES = [
  'core', 'memory', 'channel', 'web', 'comms',
  'agentic', 'ads', 'seo', 'tenders', 'content', 'builder',
] as const

export const WorkflowTriggerSchema = z.object({
  type: z.enum(['event', 'schedule', 'condition']),
  event: z.string().optional(),
  schedule: z.object({
    cron: z.string().optional(),
    interval_seconds: z.number().positive().optional(),
  }).optional(),
  condition: z.object({
    field: z.string(),
    operator: z.string(),
    value: z.unknown(),
  }).optional(),
})

export const WorkflowConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'neq', 'contains', 'gt', 'lt']),
  value: z.unknown(),
})

export const WorkflowActionSchema = z.object({
  step_id: z.string(),
  name: z.string(),
  tool_group: z.enum(TOOL_GROUP_VALUES),
  tool_name: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  delay_seconds: z.number().nonnegative().optional(),
  condition: z.string().optional(),
  on_failure: z.enum(['skip', 'abort', 'retry']).optional(),
})

export const WorkflowRuleSchema = z.object({
  name: z.string(),
  description: z.string(),
  trigger: WorkflowTriggerSchema,
  conditions: z.array(WorkflowConditionSchema),
  actions: z.array(WorkflowActionSchema).min(1),
})

export type ParsedWorkflowRule = z.infer<typeof WorkflowRuleSchema>
