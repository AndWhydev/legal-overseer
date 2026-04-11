import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/core/logger'

export interface NarrationContext {
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  userCorrections: Array<{ original: string; correction: string }>
  currentPhase: 'crawling' | 'synthesizing' | 'ingesting' | 'complete'
}

export type PipelineEvent =
  | { type: 'crawl_start' }
  | { type: 'crawl_progress'; channel: string; messagesFound: number }
  | { type: 'contact_found'; name: string; messageCount: number; relationship: string }
  | { type: 'project_found'; name: string; people: string[] }
  | { type: 'financial_found'; entity: string; amount: string; financialType: string }
  | { type: 'synthesis_start'; totalMessages: number; channels: string[] }
  | { type: 'synthesis_progress'; detail: string }
  | { type: 'ingestion_start' }
  | { type: 'reveal'; peopleCount: number; projectCount: number; financialTotal: string }
  | { type: 'agents_activated'; agents: string[] }

const NARRATION_SYSTEM_PROMPT = `You are BitBit, narrating what you're discovering as you read through a new user's email and messages for the first time. This is onboarding. You're building an understanding of their world.

Voice rules:
- Use collective pronouns: "we've got", "our", not "you have", "your"
- Be warm, direct, concise. 1-2 sentences max per message.
- Sound like a smart colleague reading through their inbox, noting things out loud
- When you find people, mention them by name and what you notice about them
- When you find money, be specific about amounts
- Never ask what to do next. Never say "anything else?" Just narrate what you see.
- Never mention AI, models, algorithms, or technical processes
- Never use emdashes, endashes, or hyphens to join clauses. Use periods or commas instead.
- Never use "your". Always use "our" or rephrase to avoid possessive pronouns about the user.
- Keep it casual, like texting a colleague
- If the user corrected something, acknowledge it naturally and move on

You're generating ONE chat message based on the pipeline event provided. Keep it short and natural.`

export async function generateNarration(
  event: PipelineEvent,
  context: NarrationContext,
): Promise<string> {
  const client = new Anthropic()

  const messages: Anthropic.MessageParam[] = [
    ...context.conversationHistory.slice(-6).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    {
      role: 'user' as const,
      content: `[SYSTEM: Generate the next narration message for this pipeline event. Do NOT address the user directly or ask questions unless the event is a contact_found with relationship "unknown". Keep it to 1-2 sentences.]

Event: ${JSON.stringify(event)}
Phase: ${context.currentPhase}
${context.userCorrections.length > 0 ? `User corrections so far: ${JSON.stringify(context.userCorrections)}` : ''}`,
    },
  ]

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: NARRATION_SYSTEM_PROMPT,
      messages,
    })

    const text = response.content.find(b => b.type === 'text')
    return text?.type === 'text' ? text.text : 'Still reading...'
  } catch (err) {
    logger.warn('[narration] Haiku call failed, using fallback', {
      error: err instanceof Error ? err.message : String(err),
    })
    return getFallbackNarration(event)
  }
}

function getFallbackNarration(event: PipelineEvent): string {
  switch (event.type) {
    case 'crawl_start': return 'Connected. Reading through the history now.'
    case 'crawl_progress': return `Scanning ${event.channel}... found ${event.messagesFound} messages.`
    case 'contact_found': return `Found ${event.name}. ${event.messageCount} messages.`
    case 'project_found': return `Spotted a project: ${event.name}.`
    case 'financial_found': return `${event.entity}: ${event.amount} (${event.financialType}).`
    case 'synthesis_start': return `Starting to piece things together from ${event.totalMessages} messages...`
    case 'synthesis_progress': return event.detail
    case 'ingestion_start': return 'Populating the world model now.'
    case 'reveal': return `Here's the world as I see it. ${event.peopleCount} people, ${event.projectCount} projects, ${event.financialTotal} outstanding.`
    case 'agents_activated': return `Set up ${event.agents.join(', ')} based on what I see. Adjust anytime.`
    default: return 'Still reading...'
  }
}
