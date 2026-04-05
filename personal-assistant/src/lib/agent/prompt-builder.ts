import { loadContext } from '@/lib/context/loader'
import { assembleContext } from '@/lib/context/assembler'
import { loadPolicies } from './policy-loader'
import { loadVoiceProfile } from './voice-loader'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function buildSystemPrompt(supabase: SupabaseClient, orgId: string, _industry?: string): Promise<string> {
  const [ctx, policyText, voiceText] = await Promise.all([
    supabase
      ? loadContext(supabase, orgId)
      : Promise.resolve({ goals: [], tasks: [], contacts: [], recentActivity: [], columns: [] }),
    loadPolicies(process.env.BITBIT_DEPLOYMENT || 'default'),
    loadVoiceProfile(process.env.BITBIT_DEPLOYMENT || 'default'),
  ])

  const now = new Date()
  const dateTime = now.toLocaleString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  const goalsSummary = ctx.goals.length > 0
    ? ctx.goals.map(g => `- [${g.priority}] ${g.description} (${g.status})`).join('\n')
    : 'No active goals set.'

  const columnMap = new Map(ctx.columns.map(c => [c.id, c.title]))
  const tasksSummary = ctx.tasks.length > 0
    ? ctx.tasks.slice(0, 30).map(t => {
      const col = t.column_id ? columnMap.get(t.column_id) ?? 'Unknown' : 'Unassigned'
      return `- [${t.priority}] ${t.title} (${col}, ${t.status})`
    }).join('\n')
    : 'No tasks on the board.'

  const contactsSummary = ctx.contacts.length > 0
    ? ctx.contacts.map(c => `- ${c.name} (${c.type})`).join('\n')
    : 'No contacts stored.'

  const recentActivitySummary = ctx.recentActivity.length > 0
    ? ctx.recentActivity.slice(0, 10).map(a =>
      `- [${a.action_type}] ${a.action}${a.result ? ` → ${a.result}` : ''}`
    ).join('\n')
    : 'No recent activity.'

  const availableColumns = ctx.columns.map(c => c.title).join(', ')

  let prompt = `You are BitBit, a personal AI that runs alongside your user's life and work.
You have access to their tasks, contacts, communications, schedule, memory, and the open web. Use your tools to take action, not just answer questions.

## Using your tools
- When you need information you don't have → web_search, then web_read the top results
- When the user provides a URL → web_read to get its content
- When you need specific data from a page (prices, emails, lists) → web_extract with CSS selectors
- When you need to read a multi-page site or docs → web_crawl
- When the user mentions a person → search_contacts to resolve them
- When the user asks about schedule or reminders → get_upcoming
- When you take a significant action → log_activity
- You can call multiple tools in sequence. Search first, read pages, then answer.
- If a tool fails, try an alternative approach before giving up.
- For complex research: search → read top 2-3 results → follow promising links → synthesize with citations.

## Current Context
Date/Time: ${dateTime}
Kanban Columns: ${availableColumns}

### Active Goals
${goalsSummary}

### Current Tasks (${ctx.tasks.length} total)
${tasksSummary}

### Known Contacts (${ctx.contacts.length})
${contactsSummary}

### Recent Activity
${recentActivitySummary}
`

  if (policyText) {
    prompt += `\n## Organization Policies\n\n${policyText}\n`
  }

  if (voiceText) {
    prompt += `\n## Voice Profile\n\n${voiceText}\n`
  }

  return prompt
}

/**
 * Build a system prompt enriched with entity context from the semantic engine.
 * If the user message mentions known contacts/entities, appends a briefing section.
 * Falls back to the base prompt if no entities are detected.
 */
export async function buildEntityAwarePrompt(
  supabase: SupabaseClient,
  orgId: string,
  userMessage: string
): Promise<string> {
  const [basePrompt, contextBriefing] = await Promise.all([
    buildSystemPrompt(supabase, orgId),
    supabase
      ? assembleContext(supabase, orgId, userMessage)
      : Promise.resolve({ resolvedEntities: [], briefings: [], summary: '' }),
  ])

  if (contextBriefing.resolvedEntities.length === 0) {
    return basePrompt
  }

  let entitySection = contextBriefing.summary
  const maxEntityContext = 4000
  if (entitySection.length > maxEntityContext) {
    entitySection = entitySection.slice(0, maxEntityContext - 3) + '...'
  }

  return `${basePrompt}

## Entity Context

${entitySection}
`
}
