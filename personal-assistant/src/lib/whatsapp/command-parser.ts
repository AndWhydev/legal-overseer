import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveEntityRanked, type RankedContact } from '../context/entity-resolver'
import { assembleContext } from '../context/assembler'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/core/logger';

export type Intent =
  | 'invoice'
  | 'lead_status'
  | 'schedule'
  | 'approve'
  | 'task_create'
  | 'report'
  | 'search'
  | 'help'
  | 'unknown'

export interface ParsedCommand {
  intent: Intent
  confidence: number
  entities: {
    contactNames?: string[]
    amounts?: number[]
    dates?: string[]
    rawQuery?: string
    projectReference?: string
    reportType?: string
    scheduleAction?: 'list' | 'create' | 'cancel'
  }
  resolvedContacts?: RankedContact[]
  contextSummary?: string
}

const VALID_INTENTS: Intent[] = [
  'invoice',
  'lead_status',
  'schedule',
  'approve',
  'task_create',
  'report',
  'search',
  'help',
]

const PARSE_PROMPT = `You are a natural language command parser for a WhatsApp business assistant.
Extract the user's intent and any relevant entities from the message.

Valid intents:
- invoice: Creating, checking, or sending invoices. E.g. "invoice sezer for $200", "send a bill", "what invoices are overdue?"
- lead_status: Checking lead pipeline, asking about prospects. E.g. "any new leads?", "what's happening with Acme?"
- schedule: Calendar and scheduling. E.g. "what's on today?", "schedule a call with Bob tomorrow", "cancel my 3pm"
- approve: Approving or rejecting a pending agent action. E.g. "yes", "Y", "approve", "no", "reject", "1Y", "2N"
- task_create: Creating tasks or reminders. E.g. "remind me to call sarah", "add task: fix the roof"
- report: Requesting summaries or reports. E.g. "weekly summary", "how did we do this month?", "revenue report"
- search: Finding contacts, emails, or records. E.g. "find bob's email", "search for plumber contacts"
- help: Asking what the assistant can do. E.g. "help", "menu", "what can you do?"

Return ONLY a JSON object:
{
  "intent": "<intent>",
  "confidence": <0-1>,
  "entities": {
    "contactNames": ["<name>"],
    "amounts": [<number>],
    "dates": ["<date in natural language or ISO>"],
    "rawQuery": "<remaining task/query description>",
    "projectReference": "<project name if mentioned>",
    "reportType": "<weekly|monthly|revenue|leads|overdue>",
    "scheduleAction": "<list|create|cancel>"
  }
}

Only include entity fields that are actually present. Be generous with confidence for clear requests.

If conversation history is provided below, use it to resolve pronouns and references:
- "him/her/them" -> the most recently mentioned contact
- "that/it/the invoice" -> the most recently discussed item
- "same amount/same project" -> reuse from prior context`

/**
 * Parse a WhatsApp message into structured intent + entities.
 * Uses Claude Haiku for fast NL parsing, then resolves entities against the org's contact database.
 */
export interface ConversationHistoryEntry {
  role: 'user' | 'assistant'
  text: string
  timestamp: number
  resolvedContact?: string
}

export async function parseCommand(
  supabase: SupabaseClient,
  orgId: string,
  text: string,
  history?: ConversationHistoryEntry[]
): Promise<ParsedCommand> {
  // Fast-path: check for obvious approval patterns without LLM
  const approvalResult = tryParseApprovalFast(text)
  if (approvalResult) return approvalResult

  // Fast-path: help
  const helpPattern = /^(help|menu|commands|\?)$/i
  if (helpPattern.test(text.trim())) {
    return { intent: 'help', confidence: 1.0, entities: {} }
  }

  const client = new Anthropic()
  let parsed: Record<string, unknown> = { intent: 'unknown', confidence: 0, entities: {} }

  // Build system prompt with conversation history if available
  let systemPrompt = PARSE_PROMPT
  if (history && history.length > 0) {
    const recentHistory = history.slice(-6)
    const historyLines = recentHistory
      .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`)
      .join('\n')
    systemPrompt += `\n\nCONVERSATION HISTORY (most recent messages):\n${historyLines}`
  }

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (textBlock && textBlock.type === 'text') {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      }
    }
  } catch (error) {
    logger.error('[command-parser] LLM parse failed:', error)
  }

  const intentRaw = parsed.intent as string
  const intent: Intent = VALID_INTENTS.includes(intentRaw as Intent)
    ? (intentRaw as Intent)
    : 'unknown'

  const entities = (parsed.entities ?? {}) as ParsedCommand['entities']

  const result: ParsedCommand = {
    intent,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    entities,
  }

  // Fallback heuristic: if no contact names were parsed but history has a resolved contact,
  // use the most recent one (handles "invoice him" where LLM missed the reference)
  if (
    (!entities.contactNames || entities.contactNames.length === 0) &&
    history &&
    history.length > 0 &&
    ['invoice', 'task_create', 'schedule', 'lead_status'].includes(intent)
  ) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].resolvedContact) {
        entities.contactNames = [history[i].resolvedContact!]
        break
      }
    }
  }

  // Resolve contact names against org database
  if (entities.contactNames && entities.contactNames.length > 0) {
    const resolved: RankedContact[] = []
    for (const name of entities.contactNames) {
      const matches = await resolveEntityRanked(supabase, name, orgId)
      if (matches.length > 0) {
        resolved.push(matches[0])
      }
    }
    result.resolvedContacts = resolved
  }

  // Assemble context summary for richer responses (only when entities found)
  if (result.resolvedContacts && result.resolvedContacts.length > 0) {
    try {
      const context = await assembleContext(supabase, orgId, text)
      if (context.summary) {
        result.contextSummary = context.summary
      }
    } catch {
      // Context assembly is optional enrichment
    }
  }

  return result
}

/**
 * Fast approval detection without calling LLM.
 * Handles: Y, N, yes, no, approve, reject, 1Y, 2N, etc.
 */
function tryParseApprovalFast(text: string): ParsedCommand | null {
  const normalized = text.trim().toUpperCase()

  // Emoji approval patterns (WhatsApp users send these)
  if (normalized === '\u{1F44D}' || normalized === '\u{1F44D}\u{1F3FB}' || normalized === '\u{1F44D}\u{1F3FC}' || normalized === '\u{1F44D}\u{1F3FD}' || normalized === '\u{1F44D}\u{1F3FE}' || normalized === '\u{1F44D}\u{1F3FF}') {
    return { intent: 'approve', confidence: 1.0, entities: { rawQuery: 'approved' } }
  }
  if (normalized === '\u{1F44E}' || normalized === '\u{1F44E}\u{1F3FB}' || normalized === '\u{1F44E}\u{1F3FC}' || normalized === '\u{1F44E}\u{1F3FD}' || normalized === '\u{1F44E}\u{1F3FE}' || normalized === '\u{1F44E}\u{1F3FF}') {
    return { intent: 'approve', confidence: 1.0, entities: { rawQuery: 'rejected' } }
  }

  if (/^(Y|YES|APPROVE|APPROVED|OK|CONFIRM|YEP|YEAH|GO|DO IT|SURE)$/i.test(normalized)) {
    return { intent: 'approve', confidence: 1.0, entities: { rawQuery: 'approved' } }
  }

  if (/^(N|NO|REJECT|REJECTED|CANCEL|NAH|NOPE|STOP|DONT)$/i.test(normalized)) {
    return { intent: 'approve', confidence: 1.0, entities: { rawQuery: 'rejected' } }
  }

  const indexedMatch = normalized.match(/^(\d+)\s*(Y|N|YES|NO|APPROVE|REJECT)$/i)
  if (indexedMatch) {
    const decision = indexedMatch[2].startsWith('Y') || indexedMatch[2] === 'APPROVE'
      ? 'approved'
      : 'rejected'
    return {
      intent: 'approve',
      confidence: 1.0,
      entities: { rawQuery: `${indexedMatch[1]}:${decision}` },
    }
  }

  return null
}
