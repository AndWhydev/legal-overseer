/**
 * Structured Output Schemas — Zod schemas for validated TAOR loop outputs.
 *
 * These schemas define the typed contracts for structured data returned by
 * Claude via the tool_use pattern. Each schema maps to a pseudo-tool that
 * forces Claude to return validated JSON instead of free-form text.
 *
 * Uses Zod v4's native toJSONSchema() for conversion — no external deps.
 */

export { ActionPlanSchema, type ActionPlan } from './action-plan'
export { RoleEvaluationSchema, type RoleEvaluationOutput } from './role-evaluation'
export { ConfidenceDecisionSchema, type ConfidenceDecisionOutput } from './confidence-decision'
export {
  createStructuredTool,
  parseStructuredOutput,
  type StructuredTool,
  type StructuredOutputResult,
} from './structured-output'
