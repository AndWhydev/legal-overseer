/**
 * RoleEvaluation Schema — structured output for role evaluation calls.
 *
 * When a role implementation calls Claude to evaluate what actions to take,
 * this schema ensures the response is properly typed and validated.
 *
 * Maps directly to the RoleEvaluation interface in role-registry.ts but
 * as a Zod schema for runtime validation.
 */

import { z } from 'zod'

/**
 * A role action — something the role wants to do.
 */
const RoleActionSchema = z.object({
  /** Action type identifier (e.g. 'send_reminder', 'draft_invoice') */
  type: z.string(),
  /** Human-readable summary of the action */
  summary: z.string(),
  /** Action-specific payload */
  payload: z.record(z.string(), z.unknown()),
  /** How confident the role is this action should be taken (0-1) */
  confidence: z.number().min(0).max(1),
  /** Whether the action can be undone */
  reversible: z.boolean(),
})

/**
 * A role insight — an observation to surface to the user.
 */
const RoleInsightSchema = z.object({
  /** Human-readable summary */
  summary: z.string(),
  /** Insight-specific details */
  details: z.record(z.string(), z.unknown()),
  /** Priority for display ordering */
  priority: z.enum(['high', 'medium', 'low']),
})

/**
 * A workflow to start — a multi-step process triggered by the evaluation.
 */
const WorkflowToStartSchema = z.object({
  /** Workflow type identifier */
  workflowType: z.string(),
  /** Steps in the workflow */
  steps: z.array(z.object({
    stepId: z.string(),
    name: z.string(),
  })),
  /** Context data for the workflow */
  context: z.record(z.string(), z.unknown()),
})

/**
 * RoleEvaluationOutput: the structured output from a role evaluation call.
 *
 * This is the validated equivalent of the RoleEvaluation interface,
 * returned when using structured output via tool_use.
 */
export const RoleEvaluationSchema = z.object({
  /** Actions the role wants to take */
  actions: z.array(RoleActionSchema),
  /** Insights to surface to the user */
  insights: z.array(RoleInsightSchema),
  /** Workflows to start */
  workflows_to_start: z.array(WorkflowToStartSchema),
  /** Key-value state updates to persist */
  state_updates: z.record(z.string(), z.unknown()).optional(),
})

export type RoleEvaluationOutput = z.infer<typeof RoleEvaluationSchema>
