import { generateText, Output } from 'ai'
import { models } from '@/lib/ai'
import { z } from 'zod'
import { logger } from '@/lib/core/logger'
import type { ToolGroup } from './tools'

export interface PlanOutput {
  stages: PlanStage[]
  toolGroups: ToolGroup[]
  complexity: 'low' | 'medium' | 'high'
  skills: string[]
}

const VALID_TOOL_GROUPS = new Set<ToolGroup>(['core', 'memory', 'channel', 'web', 'comms', 'agentic'])

export interface PlanStage {
  id: string
  label: string
  sublabel?: string
  icon: string
  toolHint?: string
}

/** Fallback tool-name → user-facing label map for reactive mode */
const TOOL_LABEL_MAP: Record<string, { label: string; sublabel: string; icon: string }> = {
  search_contacts: { label: 'Finding contact', sublabel: 'SEARCHING', icon: '👤' },
  get_contact: { label: 'Loading profile', sublabel: 'FETCHING', icon: '👤' },
  create_task: { label: 'Creating task', sublabel: 'CREATING', icon: '📋' },
  update_task: { label: 'Updating task', sublabel: 'UPDATING', icon: '✏️' },
  search_tasks: { label: 'Searching tasks', sublabel: 'SEARCHING', icon: '🔍' },
  log_activity: { label: 'Logging action', sublabel: 'LOGGING', icon: '📝' },
  search_memory: { label: 'Checking memory', sublabel: 'RECALLING', icon: '🧠' },
  add_memory: { label: 'Remembering', sublabel: 'STORING', icon: '🧠' },
  find_messages: { label: 'Looking up messages', sublabel: 'SEARCHING', icon: '💬' },
  read_message: { label: 'Reading message', sublabel: 'READING', icon: '📨' },
  send_email: { label: 'Sending email', sublabel: 'SENDING', icon: '✉️' },
  send_sms: { label: 'Sending SMS', sublabel: 'SENDING', icon: '📱' },
  compose_creator_notification_mockup: { label: 'Building mockup', sublabel: 'COMPOSING', icon: '🎨' },
  web_search: { label: 'Searching web', sublabel: 'RESEARCHING', icon: '🌐' },
  fetch_url: { label: 'Reading page', sublabel: 'FETCHING', icon: '📄' },
  get_upcoming: { label: 'Checking schedule', sublabel: 'LOADING', icon: '📅' },
  create_reminder: { label: 'Setting reminder', sublabel: 'CREATING', icon: '⏰' },
  schedule_event: { label: 'Scheduling event', sublabel: 'CREATING', icon: '📅' },
  trigger_swarm: { label: 'Deploying swarm', sublabel: 'COORDINATING', icon: '🐝' },
  spawn_agent: { label: 'Working on sub-task', sublabel: 'DELEGATING', icon: '🔀' },
}

/** Quick heuristic: skip Haiku planner for trivial messages (greetings, single words, etc.) */
const TRIVIAL_PATTERNS = [
  /^(hi|hey|hello|yo|sup|g'?day|howdy|morning|afternoon|evening|thanks|thank you|ok|okay|sure|yep|yeah|nah|no|yes)\b/i,
  /^.{1,12}$/,  // Very short messages (<=12 chars) are almost always trivial
]

export function isTrivialMessage(message: string): boolean {
  const trimmed = message.trim()
  return TRIVIAL_PATTERNS.some(p => p.test(trimmed))
}

// ---------------------------------------------------------------------------
// Structured Output Schema for the Planner
// ---------------------------------------------------------------------------

const PlanStageSchema = z.object({
  id: z.string().describe('snake_case identifier (e.g. "resolve_contact", "create_task")'),
  label: z.string().describe('User-facing name, 2-3 words max (e.g. "Steve West", "New Task")'),
  sublabel: z.string().optional().describe('Uppercase action verb, 1-2 words (e.g. "RESOLVING", "CREATING")'),
  icon: z.string().describe('Single emoji representing the stage'),
  toolHint: z.string().optional().describe('The tool name BitBit will likely call'),
})

export { PlanStageSchema }

const PlanOutputSchema = z.object({
  stages: z.array(PlanStageSchema).min(1).max(4)
    .describe('Array of 1-4 execution stages, focused on what matters to the user'),
  toolGroups: z.array(z.string())
    .describe('Tool groups needed (do NOT include "core" — it is always added). Available: memory, channel, web, comms, agentic'),
  complexity: z.enum(['low', 'medium', 'high'])
    .describe('Overall request complexity: low=greeting/simple lookup, medium=standard 1-2 step, high=multi-step research/financial/cross-entity'),
  skills: z.array(z.string())
    .describe('Skill IDs to activate from candidates, 0-2 max. Select [] if no skill candidates provided or none apply.'),
})

export { PlanOutputSchema }

const PLANNER_SYSTEM = `You are a planning assistant for BitBit, an AI operations platform. Given a user request and context, output a JSON object with execution stages and tool group selections.

Each stage object has:
- id: snake_case identifier (e.g. "resolve_contact", "create_task")
- label: user-facing name, 2-3 words max (e.g. "Steve West", "New Task")
- sublabel: uppercase action verb, 1-2 words (e.g. "RESOLVING", "CREATING")
- icon: single emoji representing the stage
- toolHint: optional, the tool name BitBit will likely call (one of: TOOL_NAMES)

Focus on what matters to the user, not internal steps. Show entities by name when possible.

Also select which tool groups are needed for this request.
Available groups: core (always included automatically), memory, channel, web, comms
Select 1-3 additional groups beyond core.

Also classify the overall complexity of this request:
- "low": greeting, acknowledgment, simple single-step lookup, small talk
- "medium": standard query, 1-2 step operation, routine tool use
- "high": multi-step research, cross-entity reasoning, financial/scheduling decisions, temporal reasoning ("last time", "compared to"), conflict resolution, 3+ stages needed

Also select which skills to activate for this request.
You may be given a list of candidate skills with descriptions.
Select 0-2 skills that are most relevant. Select [] if no candidates provided or none apply.

Output a JSON object (not array) with four fields:
- "stages": the array of stage objects as described above
- "toolGroups": array of group names (do NOT include "core" — it is always added)
- "complexity": one of "low", "medium", "high"
- "skills": array of skill IDs from the candidates (e.g., ["seo-audit"]). Use [] if none.

Examples of toolGroups selection:
- "Send Sezer a WhatsApp" -> ["channel", "comms"]
- "Search for plumbers in Sydney" -> ["web"]
- "Remember that rate is $150/hr" -> ["memory"]
- "Check my calendar" -> ["channel"]
- "What tasks are pending?" -> [] (core only)

Output ONLY the JSON object, no markdown fences or explanation.`

/**
 * Call Haiku to generate a user-meaningful execution plan with tool group selections.
 * Uses AI SDK v6 structured output (Output.object + Zod schema) for reliable parsing.
 * Falls back to empty stages/toolGroups on failure (caller handles fallback).
 */
export async function generatePlan(
  message: string,
  entityContext: string,
  toolNames: string[],
  skillCandidates?: Array<{ id: string; description: string }>,
): Promise<PlanOutput> {
  const systemPrompt = PLANNER_SYSTEM.replace('TOOL_NAMES', toolNames.join(', '))
  let userPrompt = entityContext
    ? `User request: "${message}"\n\nKnown context:\n${entityContext}`
    : `User request: "${message}"`

  if (skillCandidates && skillCandidates.length > 0) {
    userPrompt += '\n\nCandidate skills:\n' + skillCandidates
      .map(s => `- ${s.id}: ${s.description}`)
      .join('\n')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const { output: data } = await generateText({
      model: models.fast,
      output: Output.object({ schema: PlanOutputSchema }),
      maxOutputTokens: 512,
      system: systemPrompt,
      prompt: userPrompt,
      abortSignal: controller.signal,
    })

    clearTimeout(timeout)

    if (!data) {
      return { stages: [], toolGroups: [], complexity: 'medium' as const, skills: [] }
    }

    const stages: PlanStage[] = data.stages.map((s) => ({
      id: s.id,
      label: s.label,
      sublabel: s.sublabel,
      icon: s.icon,
      toolHint: s.toolHint,
    }))

    // Validate tool groups: filter to only known valid groups, exclude 'core'
    const toolGroups = (data.toolGroups ?? []).filter(
      (g: string): g is ToolGroup => typeof g === 'string' && g !== 'core' && VALID_TOOL_GROUPS.has(g as ToolGroup)
    )

    logger.info('[planner] Plan generated via structured output', {
      stageCount: stages.length,
      toolGroups,
      complexity: data.complexity,
    })

    return { stages, toolGroups, complexity: data.complexity ?? 'medium', skills: data.skills ?? [] }
  } catch {
    clearTimeout(timeout)
    return { stages: [], toolGroups: [], complexity: 'medium' as const, skills: [] }
  }
}

/**
 * Reactive fallback: generate a stage from a tool name when Haiku plan is unavailable.
 */
export function stageFromToolName(toolName: string): PlanStage | null {
  const mapped = TOOL_LABEL_MAP[toolName]
  if (!mapped) return null
  return {
    id: toolName,
    label: mapped.label,
    sublabel: mapped.sublabel,
    icon: mapped.icon,
    toolHint: toolName,
  }
}
