/**
 * Skill type definitions for BitBit
 *
 * Defines the type system for skills and subagents, enabling
 * task routing to specialized agents based on skill type.
 */

/**
 * Available skill types in BitBit
 *
 * - rd_scout: Market research, Alibaba scanning, trend analysis
 * - gatekeeper: Content QA, style guide compliance, video analysis
 * - ops_officer: Invoice processing, supplier verification, payment drafts
 * - claude_code_worker: Dispatches headless `claude -p` into a project dir
 * - general: Fallback for unclassified tasks
 */
export type SkillType =
  | 'rd_scout'
  | 'gatekeeper'
  | 'ops_officer'
  | 'claude_code_worker'
  | 'general';

/**
 * Model tier for cost/capability balancing
 *
 * - haiku: Fast, cheap - routing, classification, simple tasks
 * - sonnet: Balanced - standard execution, most skill work
 * - opus: Powerful, expensive - complex reasoning, reserved for hard problems
 */
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

/**
 * Task complexity levels for model selection
 */
export type TaskComplexity = 'simple' | 'standard' | 'complex';

/**
 * Definition of a skill in the BitBit system
 *
 * Skills encapsulate domain-specific capabilities including
 * system prompts, tool access, and cost guardrails.
 */
export interface SkillDefinition {
  /** Human-readable skill name */
  name: string;

  /** Skill type identifier */
  type: SkillType;

  /** Brief description of skill capabilities */
  description: string;

  /** System prompt defining skill behavior and constraints */
  systemPrompt: string;

  /** List of allowed tools for this skill */
  tools: string[];

  /** Default model tier for this skill's tasks */
  defaultModel: ModelTier;

  /** Maximum budget in USD per task execution */
  maxBudgetUsd: number;
}

/**
 * Subagent definition compatible with Claude Agent SDK's agents option
 *
 * This interface maps to the SDK's AgentDefinition type for spawning
 * specialized subagents via the Task tool.
 */
export interface SubagentDefinition {
  /** Description of what this subagent does */
  description: string;

  /** System prompt for the subagent */
  prompt: string;

  /** Tools available to the subagent */
  tools: string[];

  /** Model tier to use for execution */
  model: ModelTier;
}

/**
 * Result of classifying a task for routing
 *
 * Contains the determined skill type and metadata used
 * for routing decisions and model selection.
 */
export interface TaskClassification {
  /** The skill type this task should be routed to */
  skillType: SkillType;

  /** Estimated task complexity for model tier selection */
  complexity: TaskComplexity;

  /** Tools likely needed for this task */
  requiredTools: string[];

  /** Brief explanation of classification reasoning */
  reasoning: string;
}
