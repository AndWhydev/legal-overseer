/**
 * Opus World Model Synthesis
 *
 * Takes a multi-channel corpus (emails, messages, calendar events)
 * and produces a structured world model via Opus 4.
 *
 * This runs ONCE at onboarding. Cost: ~$2-5 per user.
 * The result is the foundation of BitBit's intelligence for this user.
 */

import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/core/logger'
import type { CrawledMessage } from './intelligence-crawl'

// ─── Output Types ────────────────────────────────────────────────────────────

export interface WorldModelPerson {
  name: string
  emails: string[]
  phones: string[]
  company: string
  role: string
  relationship: 'client' | 'colleague' | 'vendor' | 'personal' | 'employer' | 'unknown'
  communicationFrequency: 'daily' | 'weekly' | 'monthly' | 'rare'
  lastInteraction: string
  outstandingItems: string[]
  notes: string
}

export interface WorldModelProject {
  name: string
  status: 'active' | 'stalled' | 'completed'
  people: string[]
  urls: string[]
  description: string
  deadlines: string[]
  blockers: string[]
}

export interface WorldModelFinancial {
  type: 'receivable' | 'payable' | 'subscription'
  entity: string
  amount: string
  currency: string
  dueDate: string
  status: string
  reference: string
}

export interface WorldModelCommitment {
  description: string
  owner: 'user' | string
  deadline: string
  status: 'pending' | 'overdue' | 'done'
}

export interface WorldModel {
  user: {
    name: string
    emails: string[]
    businessName: string
    role: string
    communicationStyle: string
    technicalSkills: string[]
  }
  people: WorldModelPerson[]
  projects: WorldModelProject[]
  financials: WorldModelFinancial[]
  commitments: WorldModelCommitment[]
  websitesAndDomains: Array<{ url: string; owner: string; purpose: string }>
  communicationPatterns: string[]
  rawMarkdown: string // Full Opus output for display
}

// ─── Synthesis ───────────────────────────────────────────────────────────────

const SYNTHESIS_PROMPT = `You are building a comprehensive world model for a new user of BitBit, an AI personal assistant. This is the FIRST time BitBit meets this person. Your job is to understand their entire professional world from their communication history across email, messaging, and calendar.

Analyze ALL the messages below and produce TWO sections:

## SECTION 1: STRUCTURED DATA (JSON)

Output a JSON object with these fields:

{
  "user": {
    "name": "Full name",
    "emails": ["all email addresses used"],
    "businessName": "Business/company name",
    "role": "What they do",
    "communicationStyle": "Brief description of how they communicate",
    "technicalSkills": ["skills evident from emails"]
  },
  "people": [
    {
      "name": "Person name",
      "emails": ["email@example.com"],
      "phones": ["+61..."],
      "company": "Company name",
      "role": "Their role",
      "relationship": "client|colleague|vendor|personal|employer|unknown",
      "communicationFrequency": "daily|weekly|monthly|rare",
      "lastInteraction": "YYYY-MM-DD or approximate",
      "outstandingItems": ["any pending items between them"],
      "notes": "Key context about this person"
    }
  ],
  "projects": [
    {
      "name": "Project name",
      "status": "active|stalled|completed",
      "people": ["involved people"],
      "urls": ["any URLs, domains, staging sites"],
      "description": "What this project is",
      "deadlines": ["any deadlines"],
      "blockers": ["any blockers"]
    }
  ],
  "financials": [
    {
      "type": "receivable|payable|subscription",
      "entity": "Who owes/is owed",
      "amount": "$X,XXX",
      "currency": "AUD",
      "dueDate": "YYYY-MM-DD or description",
      "status": "pending|overdue|paid",
      "reference": "Invoice number or description"
    }
  ],
  "commitments": [
    {
      "description": "What was committed",
      "owner": "user or person name",
      "deadline": "date or 'unspecified'",
      "status": "pending|overdue|done"
    }
  ],
  "websitesAndDomains": [
    {
      "url": "full URL or domain name",
      "owner": "who this belongs to",
      "purpose": "what it's for"
    }
  ],
  "communicationPatterns": [
    "Pattern 1: e.g., 'Works late evenings and weekends'",
    "Pattern 2: e.g., 'Steve West gets same-day responses'"
  ]
}

## SECTION 2: NARRATIVE BRIEFING

After the JSON, write a natural-language briefing (2-3 paragraphs) summarizing who this person is, what their world looks like, and what BitBit should know to be immediately useful. Write it as if briefing a new assistant on their first day.

CRITICAL INSTRUCTIONS:
- Extract EVERY person name, email, phone number, URL, domain, and dollar amount
- URLs and domains are especially important — the assistant needs to know what websites exist
- Distinguish between the user's OWN emails and other people's emails
- Look for implicit project context (multiple emails about the same topic = a project)
- Financial items: capture amounts, who owes whom, due dates
- Be exhaustive. Missing a person or project means the assistant won't know about them.

---

MULTI-CHANNEL CORPUS (${'{COUNT}'} messages across ${'{CHANNELS}'}):

${'{CORPUS}'}`

/**
 * Run Opus synthesis on a multi-channel corpus.
 * Returns a structured world model.
 */
export async function synthesizeWorldModel(
  messages: CrawledMessage[],
  maxMessages: number = 200,
): Promise<WorldModel> {
  const client = new Anthropic()

  // Select most recent + most diverse messages
  const selected = selectDiverseMessages(messages, maxMessages)

  // Build corpus text
  const channelCounts = new Map<string, number>()
  const corpus = selected.map((msg, i) => {
    channelCounts.set(msg.channel, (channelCounts.get(msg.channel) ?? 0) + 1)
    const dir = msg.direction === 'sent' ? 'SENT' : msg.direction === 'event' ? 'EVENT' : 'RECEIVED'
    let content = `[${i + 1}/${selected.length}] [${msg.channel.toUpperCase()}] [${dir}] From: ${msg.from} | To: ${msg.to} | Date: ${msg.date}\nSubject: ${msg.subject}\n${msg.fullBody ?? msg.snippet}`
    // Include attachment text (truncated) for documents like invoices, contracts
    if (msg.attachmentText) {
      content += `\n[ATTACHMENTS: ${msg.attachmentNames?.join(', ') ?? 'files'}]\n${msg.attachmentText.slice(0, 2000)}`
    }
    return content
  }).join('\n---\n')

  const channels = [...channelCounts.entries()].map(([ch, n]) => `${ch}(${n})`).join(', ')

  const prompt = SYNTHESIS_PROMPT
    .replace('{COUNT}', String(selected.length))
    .replace('{CHANNELS}', channels)
    .replace('{CORPUS}', corpus)

  logger.info('[opus-synthesis] Starting synthesis', {
    messages: selected.length,
    channels,
    corpusChars: corpus.length,
    estimatedTokens: Math.round(corpus.length / 3.5),
  })

  const startTime = Date.now()

  const response = await client.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawOutput = response.content.find(b => b.type === 'text')
  const rawMarkdown = rawOutput?.type === 'text' ? rawOutput.text : ''

  logger.info('[opus-synthesis] Synthesis complete', {
    durationMs: Date.now() - startTime,
    outputChars: rawMarkdown.length,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
  })

  // Parse JSON from the output
  const worldModel = parseWorldModel(rawMarkdown)
  worldModel.rawMarkdown = rawMarkdown

  return worldModel
}

/**
 * Select a diverse set of messages: recent + spread across contacts + channels.
 */
function selectDiverseMessages(messages: CrawledMessage[], max: number): CrawledMessage[] {
  if (messages.length <= max) return messages

  // Take 60% most recent, 40% diverse (spread across unique senders)
  const recentCount = Math.floor(max * 0.6)
  const diverseCount = max - recentCount

  const recent = messages.slice(0, recentCount)
  const recentIds = new Set(recent.map(m => m.id))

  // For diversity: pick messages from unique senders not already in recent
  const remaining = messages.filter(m => !recentIds.has(m.id))
  const seenSenders = new Set<string>()
  const diverse: CrawledMessage[] = []

  for (const msg of remaining) {
    const sender = msg.from.toLowerCase().split('<')[0].trim()
    if (!seenSenders.has(sender)) {
      seenSenders.add(sender)
      diverse.push(msg)
      if (diverse.length >= diverseCount) break
    }
  }

  return [...recent, ...diverse]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

/**
 * Parse the structured JSON from Opus's mixed output.
 */
function parseWorldModel(raw: string): WorldModel {
  const empty: WorldModel = {
    user: { name: '', emails: [], businessName: '', role: '', communicationStyle: '', technicalSkills: [] },
    people: [], projects: [], financials: [], commitments: [],
    websitesAndDomains: [], communicationPatterns: [], rawMarkdown: raw,
  }

  try {
    // Find JSON block in the output
    const jsonMatch = raw.match(/\{[\s\S]*?"user"[\s\S]*?"people"[\s\S]*?\}(?=\s*\n\s*##|\s*$)/m)
    if (!jsonMatch) {
      // Try finding between code fences
      const fenceMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
      if (fenceMatch) {
        return { ...empty, ...JSON.parse(fenceMatch[1]) }
      }

      // Last resort: try to find any large JSON object
      const braceStart = raw.indexOf('{')
      if (braceStart >= 0) {
        let depth = 0
        let braceEnd = braceStart
        for (let i = braceStart; i < raw.length; i++) {
          if (raw[i] === '{') depth++
          if (raw[i] === '}') depth--
          if (depth === 0) { braceEnd = i + 1; break }
        }
        const candidate = raw.slice(braceStart, braceEnd)
        if (candidate.includes('"user"') && candidate.includes('"people"')) {
          return { ...empty, ...JSON.parse(candidate) }
        }
      }

      logger.warn('[opus-synthesis] Could not find JSON in output')
      return empty
    }

    return { ...empty, ...JSON.parse(jsonMatch[0]) }
  } catch (err) {
    logger.warn('[opus-synthesis] JSON parse failed, returning raw', {
      error: err instanceof Error ? err.message : String(err),
    })
    return empty
  }
}
