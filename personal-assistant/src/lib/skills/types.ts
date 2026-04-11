/**
 * Skill Belt Type System
 *
 * Skills are domain-specific instruction documents (prompt.md) with optional
 * tool definitions (tools.ts). They are discovered at boot from src/skills/
 * and loaded on-demand when activated by Skill RAG + planner.
 */

import type { AgentRole } from '@/lib/swarm/types'

/**
 * Lightweight index entry — always in memory, never sent to the model.
 * ~20 tokens per entry × 50 skills = ~1,000 tokens total index cost.
 */
export interface SkillIndexEntry {
  /** Directory name, e.g. "seo-audit" */
  id: string
  /** Human-readable skill name */
  name: string
  /** One-line description for Skill RAG and planner candidate display */
  description: string
  /** Topic tags for RAG scoring */
  tags: string[]
  /** High-signal keywords that strongly indicate this skill is needed */
  triggerKeywords: string[]
  /** Which swarm roles can load this skill */
  roleAffinity: AgentRole[]
  /** If present, skill's tools.ts registers tools into this tool group */
  toolGroup?: string
  /** Approximate token count of prompt.md for budget planning */
  estimatedTokens: number
  /** Optional billing plan gate (ties to existing checkToolPlanGate) */
  planGate?: string
  /** Absolute path to prompt.md */
  promptPath: string
  /** Absolute path to tools.ts (if exists) */
  toolsPath?: string
}

/**
 * Fully resolved skill — loaded on-demand when activated for a turn.
 * LRU-cached since skills don't change at runtime.
 */
export interface ResolvedSkill {
  entry: SkillIndexEntry
  /** Full prompt.md content */
  prompt: string
  /** Parsed tool definitions from tools.ts (if present) */
  tools?: Array<{
    name: string
    description: string
    input_schema: Record<string, unknown>
  }>
}
