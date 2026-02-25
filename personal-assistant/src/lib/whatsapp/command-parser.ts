import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveEntityRanked, type RankedContact } from '../context/entity-resolver'
import Anthropic from '@anthropic-ai/sdk'

export type Intent = 'invoice' | 'lead_status' | 'task_create' | 'search' | 'approve' | 'help' | 'unknown'

export interface ParsedCommand {
  intent: Intent
  confidence: number
  entities: {
    contactNames?: string[]
    amounts?: number[]
    dates?: string[]
    rawQuery?: string
  }
  resolvedContacts?: RankedContact[]
}

const PARSE_PROMPT = `You are a natural language command parser for a WhatsApp assistant.
Extract the user's intent and any relevant entities (contact names, amounts, dates) from the message.

Valid intents:
- invoice (e.g., "invoice sezer for $200", "send a bill to John")
- lead_status (e.g., "what's the status of the Acme lead", "any updates on Sezer?")
- task_create (e.g., "remind me to call sarah tomorrow", "add a task to fix the roof")
- search (e.g., "find the email from bob", "search my contacts for alice")
- approve (e.g., "approve that", "yes to the invoice", "Y", "1Y")
- help (e.g., "what can you do?", "help", "menu")

Return ONLY a JSON object matching this schema:
{
  "intent": "<intent>",
  "confidence": <number 0-1>,
  "entities": {
    "contactNames": ["<name1>", "<name2>"], // Optional
    "amounts": [<number1>, <number2>], // Optional, just the numbers
    "dates": ["<date1>"], // Optional, ISO strings or natural language
    "rawQuery": "<the rest of the query/task description>" // Optional
  }
}`

export async function parseCommand(
  supabase: SupabaseClient,
  orgId: string,
  text: string
): Promise<ParsedCommand> {
  const client = new Anthropic()

  let parsed: any = { intent: 'unknown', confidence: 0, entities: {} }

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 500,
      system: PARSE_PROMPT,
      messages: [
        { role: 'user', content: text }
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (textBlock && textBlock.type === 'text') {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      }
    }
  } catch (error) {
    console.error('Failed to parse command with LLM:', error)
  }

  const validIntents = ['invoice', 'lead_status', 'task_create', 'search', 'approve', 'help']
  if (!validIntents.includes(parsed.intent)) {
    parsed.intent = 'unknown'
  }

  const result: ParsedCommand = {
    intent: parsed.intent,
    confidence: parsed.confidence || 0,
    entities: parsed.entities || {},
  }

  // Resolve contacts if any were found
  if (result.entities.contactNames && result.entities.contactNames.length > 0) {
    const resolved: RankedContact[] = []
    for (const name of result.entities.contactNames) {
      const matches = await resolveEntityRanked(supabase, name, orgId)
      if (matches.length > 0) {
        resolved.push(matches[0]) // Take the highest ranked match
      }
    }
    result.resolvedContacts = resolved
  }

  return result
}
