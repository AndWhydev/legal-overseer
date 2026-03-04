import Anthropic from '@anthropic-ai/sdk'

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
  sync_channels: { label: 'Syncing channels', sublabel: 'SYNCING', icon: '🔄' },
  search_messages: { label: 'Searching messages', sublabel: 'SEARCHING', icon: '💬' },
  send_email: { label: 'Sending email', sublabel: 'SENDING', icon: '✉️' },
  send_sms: { label: 'Sending SMS', sublabel: 'SENDING', icon: '📱' },
  compose_creator_notification_mockup: { label: 'Building mockup', sublabel: 'COMPOSING', icon: '🎨' },
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

const PLANNER_SYSTEM = `You are a planning assistant for BitBit, an AI operations platform. Given a user request and context, output a JSON array of 2-4 stages representing what BitBit will do to fulfill the request.

Each stage object has:
- id: snake_case identifier (e.g. "resolve_contact", "create_task")
- label: user-facing name, 2-3 words max (e.g. "Steve West", "New Task")
- sublabel: uppercase action verb, 1-2 words (e.g. "RESOLVING", "CREATING")
- icon: single emoji representing the stage
- toolHint: optional, the tool name BitBit will likely call (one of: TOOL_NAMES)

Focus on what matters to the user, not internal steps. Show entities by name when possible.
Output ONLY the JSON array, no markdown fences or explanation.`

/**
 * Call Haiku to generate a user-meaningful execution plan.
 * Returns 2-4 stages that map to ProcessPipeline boxes.
 * Falls back to empty array on failure (caller handles fallback).
 */
export async function generatePlan(
  message: string,
  entityContext: string,
  toolNames: string[]
): Promise<PlanStage[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const systemPrompt = PLANNER_SYSTEM.replace('TOOL_NAMES', toolNames.join(', '))
  const userPrompt = entityContext
    ? `User request: "${message}"\n\nKnown context:\n${entityContext}`
    : `User request: "${message}"`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const response = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      { signal: controller.signal }
    )

    clearTimeout(timeout)

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    // Parse JSON, stripping any accidental markdown fences
    const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const stages = JSON.parse(cleaned) as PlanStage[]

    if (!Array.isArray(stages) || stages.length === 0) return []
    return stages.slice(0, 4).map(s => ({
      id: String(s.id || ''),
      label: String(s.label || ''),
      sublabel: s.sublabel ? String(s.sublabel) : undefined,
      icon: String(s.icon || '⚡'),
      toolHint: s.toolHint ? String(s.toolHint) : undefined,
    }))
  } catch {
    clearTimeout(timeout)
    return []
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
