/**
 * Type definitions for the Claude Code Worker skill.
 *
 * A worker is a one-shot, headless `claude -p` invocation scoped to a
 * single project directory. Inputs describe what to do (and where);
 * outputs capture stdout, exit code, cost, and any tool calls observed.
 */

import type { ModelTier } from '../types.js';

/**
 * Input describing one worker invocation. Persisted as the task's
 * input_json so the processor can resume / inspect after the fact.
 */
export interface ClaudeCodeWorkerInput {
  /** Project ID from the projects table — resolves cwd + CLAUDE.md */
  project_id: string;
  /** The prompt to send to headless Claude Code */
  prompt: string;
  /**
   * Optional model tier override. If unset, falls back to the project's
   * model_tier_override, then to the skill's default ('sonnet').
   */
  model_tier?: ModelTier;
  /**
   * Optional allowedTools override. If unset, uses the skill's default
   * allowlist (read/edit/grep/bash etc).
   */
  allowed_tools?: string[];
  /**
   * Optional max budget in USD for this invocation. If unset, falls back
   * to the skill's maxBudgetUsd.
   */
  max_budget_usd?: number;
  /**
   * Optional timeout in milliseconds. If unset, defaults to 30 min.
   */
  timeout_ms?: number;
  /**
   * Optional additional system context to prepend to the prompt
   * (e.g., lessons learned, playbook excerpts — used in Stage 5).
   */
  extra_context?: string;
}

/**
 * Result of running one headless Claude Code worker.
 *
 * Persisted as the task's output_json. Mirrors the shape of
 * SkillExecutionResult so the overseer can treat workers uniformly with
 * other skills.
 */
export interface ClaudeCodeWorkerResult {
  /** Whether the worker exited cleanly (exit code 0) */
  success: boolean;
  /** Captured stdout (final assistant message + any structured output) */
  output: string;
  /** Captured stderr — useful when success is false */
  stderr: string;
  /** Process exit code */
  exitCode: number | null;
  /** Total cost in USD, parsed from result message if available */
  costUsd?: number;
  /** Tools the worker invoked, in order, deduplicated */
  toolCalls: string[];
  /** Wall-clock duration in ms */
  durationMs: number;
  /** Model tier actually used */
  modelTier: ModelTier;
  /** Project this worker was scoped to */
  projectId: string;
  /** Absolute project path used as cwd */
  projectPath: string;
  /** Error message if anything failed */
  error?: string;
}
