import Anthropic from '@anthropic-ai/sdk'
import { TOOL_GROUPS, type ToolGroup } from '@/lib/agent/tools'
import {
  WorkflowRuleSchema,
  SUPPORTED_EVENTS,
  type WorkflowRule,
  type ParsedWorkflowRule,
} from './workflow-rule-types'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// System prompt for NL -> structured rule parsing
// ---------------------------------------------------------------------------

const toolGroupSummary = Object.entries(TOOL_GROUPS)
  .map(([id, meta]) => `- **${id}**: ${meta.description} (tools: ${meta.tools.join(', ')})`)
  .join('\n')

const eventList = SUPPORTED_EVENTS.join(', ')

export const RULE_PARSER_SYSTEM_PROMPT = `You are a workflow rule parser. Convert natural language automation rules into structured JSON.

## Available Tool Groups
${toolGroupSummary}

## Supported Event Types
${eventList}

## Trigger Types
- **event**: Fires when a specific event occurs (new_message, new_lead, invoice_overdue, invoice_paid, new_contact)
- **schedule**: Fires on a time schedule (cron pattern like "08:00" for daily at 8am, or interval_seconds for periodic)
- **condition**: Fires when a data condition is met (evaluated on periodic checks)

## Output Format
Return ONLY valid JSON with this structure:
{
  "name": "Short descriptive name",
  "description": "Original user intent",
  "trigger": {
    "type": "event" | "schedule" | "condition",
    "event": "event_name (if type=event)",
    "schedule": { "cron": "HH:MM" or "interval_seconds": number } (if type=schedule),
    "condition": { "field": "...", "operator": "...", "value": ... } (if type=condition)
  },
  "conditions": [
    { "field": "field_name", "operator": "eq|neq|contains|gt|lt", "value": ... }
  ],
  "actions": [
    {
      "step_id": "unique_step_id",
      "name": "Human-readable step name",
      "tool_group": "one of the tool group IDs above",
      "tool_name": "specific tool from that group",
      "parameters": { ... },
      "delay_seconds": 0,
      "on_failure": "skip" | "abort" | "retry"
    }
  ],
  "confidence": 0.0 to 1.0
}

## Rules
- Map actions to REAL tool groups and tool names from the list above
- Use template variables like {{lead.email}}, {{org.name}}, {{invoice.number}} for dynamic values
- Set confidence < 0.5 if the intent is unclear or you cannot map to available tools
- Return confidence 0.0 if the input makes no sense as an automation rule
- Always include at least one action
- Keep step_ids short and snake_case`

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export interface ParseResult {
  rule: Partial<WorkflowRule>
  confidence: number
  needsReview: boolean
}

export async function parseWorkflowRule(
  naturalLanguage: string,
  orgContext: { roles: string[]; tools: string[] },
): Promise<ParseResult> {
  try {
    const anthropic = new Anthropic()

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-20250414',
      max_tokens: 1024,
      system: RULE_PARSER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Parse this automation rule:\n\n"${naturalLanguage}"\n\nAvailable roles: ${orgContext.roles.join(', ')}\nAvailable tools: ${orgContext.tools.join(', ')}`,
        },
      ],
    })

    // Extract JSON from response
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const json = extractJSON(text)
    if (!json) {
      logger.warn('[workflow-rule-parser] No JSON found in LLM response')
      return {
        rule: { name: 'Parse Error', description: naturalLanguage },
        confidence: 0,
        needsReview: true,
      }
    }

    const parsed = JSON.parse(json)
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0

    // Validate against zod schema
    const validation = WorkflowRuleSchema.safeParse(parsed)

    if (!validation.success) {
      logger.warn('[workflow-rule-parser] Schema validation failed', {
        errors: validation.error.issues,
      })
      return {
        rule: {
          name: parsed.name || 'Invalid Rule',
          description: naturalLanguage,
          trigger: parsed.trigger,
          conditions: parsed.conditions,
          actions: parsed.actions,
        },
        confidence: 0,
        needsReview: true,
      }
    }

    const validRule = validation.data as ParsedWorkflowRule

    return {
      rule: {
        name: validRule.name,
        description: validRule.description,
        trigger: validRule.trigger,
        conditions: validRule.conditions,
        actions: validRule.actions,
      },
      confidence,
      needsReview: confidence < 0.5,
    }
  } catch (error) {
    logger.error('[workflow-rule-parser] Failed to parse rule', { error })
    return {
      rule: { name: 'Error', description: naturalLanguage },
      confidence: 0,
      needsReview: true,
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the first JSON object from a string (handles markdown code blocks). */
function extractJSON(text: string): string | null {
  // Try markdown code block first
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1].trim()

  // Try raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  return jsonMatch ? jsonMatch[0] : null
}
