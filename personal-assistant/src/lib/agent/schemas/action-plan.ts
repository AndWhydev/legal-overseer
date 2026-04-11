/**
 * ActionPlan Schema — structured output for the TAOR planner.
 *
 * Replaces the free-form JSON parsing in planner.ts with a validated
 * schema. The planner can optionally use this via tool_use to get
 * type-safe output from Claude.
 */

import { z } from 'zod'

/**
 * A single tool call the agent plans to make.
 */
const ToolCallSchema = z.object({
  /** Tool name to invoke */
  tool_name: z.string(),
  /** Brief description of why this tool is being called */
  purpose: z.string(),
  /** Key input parameters (not the full payload — just enough for planning) */
  key_params: z.record(z.string(), z.unknown()).optional(),
})

/**
 * A risk the agent has identified with the proposed plan.
 */
const RiskSchema = z.object({
  /** What could go wrong */
  description: z.string(),
  /** How likely it is to happen */
  severity: z.enum(['low', 'medium', 'high']),
  /** What to do if it happens */
  mitigation: z.string().optional(),
})

/**
 * ActionPlan: the structured output from the Haiku planner.
 *
 * Represents a complete execution plan with confidence scoring,
 * planned tool calls, and identified risks.
 */
export const ActionPlanSchema = z.object({
  /** The primary action type for this plan */
  action: z.enum([
    'execute_tools',
    'respond_directly',
    'ask_clarification',
    'delegate_to_role',
    'multi_step_workflow',
  ]),
  /** How confident the planner is (0-1) */
  confidence: z.number().min(0).max(1),
  /** Why this plan was chosen */
  reasoning: z.string(),
  /** Ordered list of tool calls to make */
  tool_calls: z.array(ToolCallSchema),
  /** Identified risks with the plan */
  risks: z.array(RiskSchema),
  /** Which tool groups are needed (e.g. 'memory', 'web', 'comms') */
  tool_groups: z.array(z.string()).optional(),
})

export type ActionPlan = z.infer<typeof ActionPlanSchema>
