/**
 * Temporal Urgency Scoring System
 *
 * Computes real urgency from multiple signals rather than keyword matching.
 * Five weighted dimensions: deadline proximity, contact importance, financial
 * signals, explicit urgency language, and historical response patterns.
 *
 * Pure heuristic + DB lookups — no LLM calls for speed and cost.
 *
 * @module intelligence/urgency-scorer
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ─── Types ───────────────────────────────────────────────────────────────

export interface UrgencyMessage {
  sender: string
  sender_email?: string | null
  subject?: string | null
  body: string
  channel: string
  received_at: string
}

export interface UrgencyDimensions {
  deadline: number
  contactImportance: number
  financial: number
  explicit: number
  historical: number
}

export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low'

export interface UrgencyResult {
  score: number
  level: UrgencyLevel
  reasoning: string
  dimensions: UrgencyDimensions
}

// ─── Weights ─────────────────────────────────────────────────────────────

const WEIGHTS = {
  deadline: 0.30,
  contactImportance: 0.25,
  financial: 0.20,
  explicit: 0.15,
  historical: 0.10,
} as const

// ─── 1. Deadline Proximity ───────────────────────────────────────────────

/** Relative date phrases mapped to approximate days from now */
const RELATIVE_DATE_PHRASES: Array<{ pattern: RegExp; daysFromNow: () => number }> = [
  { pattern: /\b(?:overdue|past\s+due|late)\b/i, daysFromNow: () => -1 },
  { pattern: /\btoday\b/i, daysFromNow: () => 0 },
  { pattern: /\btonight\b/i, daysFromNow: () => 0 },
  { pattern: /\btomorrow\b/i, daysFromNow: () => 1 },
  { pattern: /\bday\s+after\s+tomorrow\b/i, daysFromNow: () => 2 },
  { pattern: /\bnext\s+week\b/i, daysFromNow: () => 7 },
  { pattern: /\bnext\s+month\b/i, daysFromNow: () => 30 },
  { pattern: /\bend\s+of\s+(?:the\s+)?week\b/i, daysFromNow: () => daysUntilEndOfWeek() },
  { pattern: /\bend\s+of\s+(?:the\s+)?month\b/i, daysFromNow: () => daysUntilEndOfMonth() },
  { pattern: /\b(?:eod|end\s+of\s+(?:the\s+)?day)\b/i, daysFromNow: () => 0 },
  { pattern: /\b(?:eow)\b/i, daysFromNow: () => daysUntilEndOfWeek() },
  { pattern: /\b(?:eom)\b/i, daysFromNow: () => daysUntilEndOfMonth() },
]

/** Day-of-week patterns: "by Friday", "due Monday" */
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAY_PATTERN = /\b(?:by|due|before|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i

/** Month+date patterns: "March 15", "due April 3rd", "by January 22" */
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]
const MONTH_DATE_PATTERN = new RegExp(
  `\\b(${MONTH_NAMES.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
  'i',
)

/** ISO date pattern: 2026-03-15 or 2026/03/15 */
const ISO_DATE_PATTERN = /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/

/** Slash date: 3/15/2026 or 15/3/2026 */
const SLASH_DATE_PATTERN = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/

function daysUntilEndOfWeek(): number {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 5=Fri
  // End of week = Friday
  const daysToFriday = (5 - dayOfWeek + 7) % 7
  return daysToFriday === 0 ? 0 : daysToFriday
}

function daysUntilEndOfMonth(): number {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return lastDay - now.getDate()
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((to.getTime() - from.getTime()) / msPerDay)
}

/**
 * Extract the closest deadline from text and return days until that deadline.
 * Returns null if no deadline detected.
 */
function extractDeadlineDays(text: string, receivedAt: Date): number | null {
  const candidates: number[] = []

  // Check relative date phrases
  for (const { pattern, daysFromNow } of RELATIVE_DATE_PHRASES) {
    if (pattern.test(text)) {
      candidates.push(daysFromNow())
    }
  }

  // Check day-of-week references ("by Friday")
  const dayMatch = text.match(DAY_PATTERN)
  if (dayMatch) {
    const targetDay = DAY_NAMES.indexOf(dayMatch[1].toLowerCase())
    if (targetDay >= 0) {
      const today = receivedAt.getDay()
      let daysUntil = (targetDay - today + 7) % 7
      if (daysUntil === 0) daysUntil = 0 // same day = today
      candidates.push(daysUntil)
    }
  }

  // Check month+date patterns ("March 15")
  const monthMatch = text.match(MONTH_DATE_PATTERN)
  if (monthMatch) {
    const monthIdx = MONTH_NAMES.indexOf(monthMatch[1].toLowerCase())
    const day = parseInt(monthMatch[2], 10)
    if (monthIdx >= 0 && day >= 1 && day <= 31) {
      // Assume current year; if date is far in the past, assume next year
      let year = receivedAt.getFullYear()
      let target = new Date(year, monthIdx, day)
      if (target.getTime() < receivedAt.getTime() - 90 * 24 * 60 * 60 * 1000) {
        target = new Date(year + 1, monthIdx, day)
      }
      candidates.push(daysBetween(receivedAt, target))
    }
  }

  // Check ISO dates (2026-03-15)
  const isoMatch = text.match(ISO_DATE_PATTERN)
  if (isoMatch) {
    const target = new Date(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10) - 1,
      parseInt(isoMatch[3], 10),
    )
    if (!isNaN(target.getTime())) {
      candidates.push(daysBetween(receivedAt, target))
    }
  }

  // Check slash dates (3/15/2026) — assume M/D/Y
  const slashMatch = text.match(SLASH_DATE_PATTERN)
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10) - 1
    const day = parseInt(slashMatch[2], 10)
    let year = parseInt(slashMatch[3], 10)
    if (year < 100) year += 2000
    const target = new Date(year, month, day)
    if (!isNaN(target.getTime()) && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      candidates.push(daysBetween(receivedAt, target))
    }
  }

  if (candidates.length === 0) return null

  // Return the most urgent (smallest) deadline
  return Math.min(...candidates)
}

function scoreDeadline(text: string, receivedAt: Date): { score: number; detail: string | null } {
  const days = extractDeadlineDays(text, receivedAt)

  if (days === null) {
    return { score: 0.3, detail: null } // Neutral — no deadline detected
  }

  if (days < 0) return { score: 1.0, detail: 'overdue' }
  if (days === 0) return { score: 0.9, detail: 'due today' }
  if (days <= 2) return { score: 0.8, detail: `due in ${days} day${days === 1 ? '' : 's'}` }
  if (days <= 7) return { score: 0.7, detail: 'due this week' }
  if (days <= 30) return { score: 0.4, detail: 'due this month' }
  return { score: 0.1, detail: `due in ${days} days` }
}

// ─── 2. Contact Importance ───────────────────────────────────────────────

/** Map contact.type from the contacts table to a base importance score */
const CONTACT_TYPE_SCORES: Record<string, number> = {
  client: 0.9,
  vendor: 0.7,
  business: 0.5,
  acquaintance: 0.3,
  family: 0.6,
  other: 0.2,
}

interface ContactLookup {
  id: string
  name: string
  type: string | null
  hasOutstandingInvoices: boolean
  hasActiveTasks: boolean
}

async function lookupContact(
  supabase: SupabaseClient,
  orgId: string,
  senderEmail: string | null,
  senderName: string,
): Promise<ContactLookup | null> {
  if (!senderEmail && !senderName) return null

  // Try email match first (highest confidence)
  let contactRow: { id: string; name: string; type: string | null } | null = null

  if (senderEmail) {
    const { data } = await supabase
      .from('contacts')
      .select('id, name, type')
      .eq('org_id', orgId)
      .contains('emails', [senderEmail])
      .limit(1)
      .single()
    contactRow = data
  }

  // Fallback: name match
  if (!contactRow && senderName) {
    const { data } = await supabase
      .from('contacts')
      .select('id, name, type')
      .eq('org_id', orgId)
      .ilike('name', senderName)
      .limit(1)
      .single()
    contactRow = data
  }

  if (!contactRow) return null

  // Check for outstanding invoices
  const { count: invoiceCount } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('client_contact_id', contactRow.id)
    .in('status', ['sent', 'viewed', 'overdue']) as { count: number | null }

  // Check for active tasks linked to this contact
  const { count: taskCount } = await supabase
    .from('entity_relationships')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .or(
      `and(entity_a_type.eq.contact,entity_a_id.eq.${contactRow.id},entity_b_type.eq.task),` +
      `and(entity_b_type.eq.contact,entity_b_id.eq.${contactRow.id},entity_a_type.eq.task)`,
    ) as { count: number | null }

  return {
    id: contactRow.id,
    name: contactRow.name,
    type: contactRow.type,
    hasOutstandingInvoices: (invoiceCount ?? 0) > 0,
    hasActiveTasks: (taskCount ?? 0) > 0,
  }
}

function scoreContactImportance(contact: ContactLookup | null): { score: number; detail: string | null } {
  if (!contact) {
    return { score: 0.2, detail: 'unknown sender' }
  }

  let score = CONTACT_TYPE_SCORES[contact.type ?? 'other'] ?? 0.2

  if (contact.hasOutstandingInvoices) score += 0.1
  if (contact.hasActiveTasks) score += 0.05

  score = Math.min(1.0, score)

  const parts: string[] = [contact.type ?? 'contact']
  if (contact.hasOutstandingInvoices) parts.push('outstanding invoices')
  if (contact.hasActiveTasks) parts.push('active tasks')

  return { score, detail: `${contact.name} (${parts.join(', ')})` }
}

// ─── 3. Financial Signal ─────────────────────────────────────────────────

/** Match dollar amounts: $1,500.00, $250, etc. */
const DOLLAR_PATTERN = /\$\s*([\d,]+(?:\.\d{1,2})?)/g

/** Financial keywords that boost urgency even without an explicit amount */
const FINANCIAL_KEYWORDS = /\b(?:invoice|invoiced|payment|overdue|billing|billed|outstanding\s+balance|past\s+due|remittance|accounts?\s+(?:receivable|payable))\b/i

/** Payment failure keywords — these are always high urgency regardless of amount */
const FINANCIAL_FAILURE_KEYWORDS = /\b(?:unsuccessful|failed|declined|rejected|expired|bounced|could\s+not\s+(?:be\s+)?process|unable\s+to\s+(?:process|charge)|payment\s+error|charge\s+failed|transaction\s+failed|card\s+declined)\b/i

function scoreFinancial(text: string): { score: number; detail: string | null } {
  // Extract dollar amounts
  const amounts: number[] = []
  let match
  // Reset lastIndex since we reuse the global regex
  DOLLAR_PATTERN.lastIndex = 0
  while ((match = DOLLAR_PATTERN.exec(text)) !== null) {
    const raw = match[1].replace(/,/g, '')
    const val = parseFloat(raw)
    if (!isNaN(val) && val > 0) amounts.push(val)
  }

  const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0
  let score = maxAmount > 0 ? Math.min(1.0, maxAmount / 5000) : 0.0

  // Payment failure = always high urgency — service disruption risk
  const hasFailure = FINANCIAL_FAILURE_KEYWORDS.test(text)
  if (hasFailure && FINANCIAL_KEYWORDS.test(text)) {
    score = Math.max(score, 0.85)
    const detail = maxAmount > 0
      ? `PAYMENT FAILURE: $${maxAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
      : 'PAYMENT FAILURE detected'
    return { score, detail }
  }

  // Financial keyword boost (non-failure)
  if (FINANCIAL_KEYWORDS.test(text)) {
    score += 0.3
  }

  score = Math.min(1.0, score)

  if (score === 0) return { score: 0, detail: null }

  const detail = maxAmount > 0
    ? `$${maxAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    : 'financial keywords detected'

  return { score, detail }
}

// ─── 4. Explicit Urgency ─────────────────────────────────────────────────

const HIGH_URGENCY_KEYWORDS = /\b(?:urgent|asap|immediately|critical|emergency)\b/i
const MEDIUM_URGENCY_KEYWORDS = /\b(?:important|priority|time[- ]?sensitive|pressing|crucial)\b/i

function scoreExplicitUrgency(text: string, subject: string | null): { score: number; detail: string | null } {
  const combined = [subject, text].filter(Boolean).join(' ')

  if (HIGH_URGENCY_KEYWORDS.test(combined)) {
    const matched = combined.match(HIGH_URGENCY_KEYWORDS)
    return { score: 0.9, detail: `"${matched?.[0]}" in message` }
  }

  if (MEDIUM_URGENCY_KEYWORDS.test(combined)) {
    const matched = combined.match(MEDIUM_URGENCY_KEYWORDS)
    return { score: 0.6, detail: `"${matched?.[0]}" in message` }
  }

  // Question marks in subject suggest a response is expected
  if (subject && subject.includes('?')) {
    return { score: 0.3, detail: 'question in subject' }
  }

  return { score: 0, detail: null }
}

// ─── 5. Historical Pattern ───────────────────────────────────────────────

/**
 * Check how quickly the user typically responds to this sender.
 * Uses entity_timeline to find sent/received message pairs.
 */
async function scoreHistoricalPattern(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string | null,
): Promise<{ score: number; detail: string | null }> {
  if (!contactId) return { score: 0.3, detail: null } // No history

  // Get the last 20 message events for this contact to compute response times
  const { data: events } = await supabase
    .from('entity_timeline')
    .select('event_type, occurred_at')
    .eq('org_id', orgId)
    .eq('entity_type', 'contact')
    .eq('entity_id', contactId)
    .in('event_type', ['message_received', 'message_sent'])
    .order('occurred_at', { ascending: true })
    .limit(40)

  if (!events || events.length < 2) return { score: 0.3, detail: null }

  // Compute response times: time between received and next sent
  const responseTimes: number[] = []

  for (let i = 0; i < events.length - 1; i++) {
    if (events[i].event_type === 'message_received' && events[i + 1].event_type === 'message_sent') {
      const received = new Date(events[i].occurred_at).getTime()
      const sent = new Date(events[i + 1].occurred_at).getTime()
      const hoursToRespond = (sent - received) / (1000 * 60 * 60)
      if (hoursToRespond > 0 && hoursToRespond < 168) { // Cap at 1 week
        responseTimes.push(hoursToRespond)
      }
    }
  }

  if (responseTimes.length === 0) return { score: 0.3, detail: null }

  const avgHours = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length

  // Fast responder (< 24h) = this sender is considered important
  if (avgHours <= 24) {
    return { score: 0.7, detail: `typically respond within ${Math.round(avgHours)}h` }
  }
  // Moderate responder (1-3 days)
  if (avgHours <= 72) {
    return { score: 0.4, detail: `typically respond within ${Math.round(avgHours / 24)} days` }
  }
  // Slow responder (3+ days)
  return { score: 0.2, detail: `typically respond in ${Math.round(avgHours / 24)}+ days` }
}

// ─── Composite Scorer ────────────────────────────────────────────────────

function levelFromScore(score: number): UrgencyLevel {
  if (score > 0.8) return 'critical'
  if (score > 0.6) return 'high'
  if (score > 0.3) return 'medium'
  return 'low'
}

function buildReasoning(
  dimensions: UrgencyDimensions,
  details: {
    deadline: string | null
    contact: string | null
    financial: string | null
    explicit: string | null
    historical: string | null
  },
): string {
  const parts: string[] = []

  // Lead with the most salient signal
  const ranked = [
    { key: 'deadline', score: dimensions.deadline, detail: details.deadline },
    { key: 'contact', score: dimensions.contactImportance, detail: details.contact },
    { key: 'financial', score: dimensions.financial, detail: details.financial },
    { key: 'explicit', score: dimensions.explicit, detail: details.explicit },
    { key: 'historical', score: dimensions.historical, detail: details.historical },
  ]
    .filter((d) => d.detail !== null && d.score > 0.2)
    .sort((a, b) => b.score - a.score)

  for (const item of ranked.slice(0, 3)) {
    if (item.detail) parts.push(item.detail)
  }

  if (parts.length === 0) return 'No strong urgency signals detected'
  // Capitalise first letter and join with context
  const joined = parts.join('; ')
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

/**
 * Compute temporal urgency from multiple weighted signals.
 *
 * Fire-and-forget safe: returns a low-urgency fallback on any error.
 *
 * @param supabase Supabase client
 * @param orgId Organisation ID
 * @param message Message to score
 */
export async function computeUrgency(
  supabase: SupabaseClient,
  orgId: string,
  message: UrgencyMessage,
): Promise<UrgencyResult> {
  try {
    const receivedAt = new Date(message.received_at)
    const text = [message.subject, message.body].filter(Boolean).join(' ')

    // Run DB lookups concurrently
    const contactPromise = lookupContact(
      supabase, orgId, message.sender_email ?? null, message.sender,
    )

    const contact = await contactPromise

    // Run historical pattern lookup (needs contactId from above)
    const [historicalResult] = await Promise.all([
      scoreHistoricalPattern(supabase, orgId, contact?.id ?? null),
    ])

    // Compute all dimension scores
    const deadlineResult = scoreDeadline(text, receivedAt)
    const contactResult = scoreContactImportance(contact)
    const financialResult = scoreFinancial(text)
    const explicitResult = scoreExplicitUrgency(text, message.subject ?? null)

    const dimensions: UrgencyDimensions = {
      deadline: deadlineResult.score,
      contactImportance: contactResult.score,
      financial: financialResult.score,
      explicit: explicitResult.score,
      historical: historicalResult.score,
    }

    // Weighted composite
    const score = Math.round((
      dimensions.deadline * WEIGHTS.deadline +
      dimensions.contactImportance * WEIGHTS.contactImportance +
      dimensions.financial * WEIGHTS.financial +
      dimensions.explicit * WEIGHTS.explicit +
      dimensions.historical * WEIGHTS.historical
    ) * 100) / 100

    const level = levelFromScore(score)

    const reasoning = buildReasoning(dimensions, {
      deadline: deadlineResult.detail,
      contact: contactResult.detail,
      financial: financialResult.detail,
      explicit: explicitResult.detail,
      historical: historicalResult.detail,
    })

    return { score, level, reasoning, dimensions }
  } catch (err) {
    logger.warn('[urgency-scorer] Failed to compute urgency', {
      messageId: message.sender,
      error: err instanceof Error ? err.message : String(err),
    })

    // Safe fallback
    return {
      score: 0.15,
      level: 'low',
      reasoning: 'Urgency scoring failed — defaulting to low',
      dimensions: {
        deadline: 0.3,
        contactImportance: 0.2,
        financial: 0,
        explicit: 0,
        historical: 0.3,
      },
    }
  }
}
