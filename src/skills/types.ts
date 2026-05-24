/**
 * Skill type definitions for Legal Overseer.
 *
 * Defines the type system for legal-specific skills. Every output a
 * skill produces is treated as draft-only and lands in the human
 * review queue before reaching a client or court.
 */

/**
 * Available legal skill types.
 *
 * - contract_review:    read contracts, flag unusual clauses, missing
 *                       protections, liability risks
 * - legal_research:     search AustLII, summarise case law, flag every
 *                       citation as unverified
 * - matter_drafting:    draft letters, memos, contracts, court documents
 * - matter_management:  track deadlines, limitation periods, key dates,
 *                       send reminders
 * - client_comms:       draft client update emails and correspondence
 * - compliance_monitor: monitor regulatory changes relevant to matter
 *                       types
 * - general:            fallback for unclassified tasks (still gated
 *                       behind human review)
 */
export type SkillType =
  | 'contract_review'
  | 'legal_research'
  | 'matter_drafting'
  | 'matter_management'
  | 'client_comms'
  | 'compliance_monitor'
  | 'general';

/**
 * Model tier for cost / capability balancing.
 *
 * Reserved-by-policy: Opus is permitted only for contract_review and
 * legal_research where the cost of a missed risk dwarfs the model spend.
 */
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

/** Task complexity buckets used by selectModel(). */
export type TaskComplexity = 'simple' | 'standard' | 'complex';

export interface SkillDefinition {
  /** Human-readable skill name (shown on dashboard + review queue). */
  name: string;
  /** Skill type identifier (also used as the tasks.skill_id value). */
  type: SkillType;
  /** Brief one-line description shown in routing logs. */
  description: string;
  /** System prompt defining skill behaviour and hard constraints. */
  systemPrompt: string;
  /** Tools the skill is allowed to call. */
  tools: string[];
  /** Default model tier for this skill. */
  defaultModel: ModelTier;
  /** Per-task hard budget in USD (also caps Anthropic spend). */
  maxBudgetUsd: number;
  /**
   * If true, every output from this skill MUST land in the review queue
   * before it can leave the system (be emailed to a client, filed with
   * the court, etc.). All legal skills default to true.
   */
  requiresHumanReview: boolean;
}

/**
 * Subagent definition compatible with the Claude Agent SDK's agents
 * option (so a skill can be spawned as a subagent via the Task tool).
 */
export interface SubagentDefinition {
  description: string;
  prompt: string;
  tools: string[];
  model: ModelTier;
}

/**
 * Result of classifying an inbound task for routing.
 */
export interface TaskClassification {
  skillType: SkillType;
  complexity: TaskComplexity;
  requiredTools: string[];
  /** Brief explanation of classification reasoning. */
  reasoning: string;
}
