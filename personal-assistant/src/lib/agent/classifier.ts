import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelMessage } from '@/lib/channels/types'
import Anthropic from '@anthropic-ai/sdk'
import { assembleContext } from '@/lib/context/assembler'
import { resolveModel } from '@/lib/agent/model-registry'
import { logger } from '@/lib/core/logger';

// ---------------------------------------------------------------------------
// Types — Header-Based Classification
// ---------------------------------------------------------------------------

export type SenderType = 'human' | 'automated' | 'transactional' | 'marketing'

export interface ContentSignals {
  htmlRatio: number // 0-1, fraction of message that is HTML
  linkDensity: number // 0-1, fraction of content that is links
  hasUnsubscribeLink: boolean
  hasTrackingPixels: boolean
  imageCount: number
  personalGreeting: boolean // starts with name-based greeting
}

export interface ActionabilitySignals {
  hasQuestion: boolean // +2
  hasDeadline: boolean // +3
  hasDirective: boolean // +2
  hasUrgency: boolean // +2
  hasMention: boolean // +3 (user mentioned)
  isReplyToUser: boolean // +1
  isKnownClient: boolean // +2
  hasOutstandingInvoice: boolean // +1
  score: number
  category: 'priority' | 'updates' | 'low' // score >= 4 → priority, 2-3 → updates, 0-1 → low
}

export type InboxCategory = 'action_required' | 'fyi' | 'conversation' | 'automated' | 'marketing' | 'spam'

export interface ClassificationResult {
  significance: number // 1-10
  timeSensitivity: 'immediate' | 'today' | 'this_week' | 'whenever' | 'none'
  resolves: string[]
  unblocks: string[]
  recommendedActions: string[] // e.g., ["reply", "create_task", "forward_to_lead_swarm"]
  reasoning: string
  category: 'lead' | 'client' | 'vendor' | 'personal' | 'spam' | 'notification' | 'newsletter'
  summary: string // 1-2 sentence plain-English summary of the message content
}

// ---------------------------------------------------------------------------
// Header-Based Classification Functions
// ---------------------------------------------------------------------------

/**
 * Classify sender type based on email headers.
 * Returns deterministic sender classification BEFORE LLM analysis.
 */
export function classifyByHeaders(headers: Record<string, string>): SenderType {
  const normalizedHeaders = normalizeHeaders(headers)

  // Marketing signals
  if (normalizedHeaders['list-unsubscribe'] || normalizedHeaders['list-unsubscribe-post']) {
    return 'marketing'
  }
  const precedence = normalizedHeaders['precedence']
  if (precedence === 'bulk' || precedence === 'list') {
    return 'marketing'
  }

  // Transactional signals (sent by services/automated systems)
  const xMailer = normalizedHeaders['x-mailer'] || ''
  if (xMailer.includes('postmark') || xMailer.includes('sendgrid') || xMailer.includes('ses')) {
    return 'transactional'
  }
  if (normalizedHeaders['x-ses-outgoing']) {
    return 'transactional'
  }

  // Marketing (specialized ESPs)
  if (xMailer.includes('mailchimp')) {
    return 'marketing'
  }
  if (normalizedHeaders['feedback-id']) {
    return 'marketing'
  }

  // Auto-submitted (out of office, vacation, auto-responses)
  const autoSubmitted = normalizedHeaders['auto-submitted']
  if (autoSubmitted && autoSubmitted !== 'no') {
    return 'automated'
  }
  if (normalizedHeaders['x-autoreply'] || normalizedHeaders['x-autorespond']) {
    return 'automated'
  }

  // No-reply addresses
  const from = normalizedHeaders['from'] || ''
  if (/no-?reply|donotreply|notifications?@|mailer-daemon|bounces?@|postmaster@/i.test(from)) {
    return 'automated'
  }

  // Known notification platform domains — these are never human-to-human
  if (/(@|\.)(?:linkedin\.com|facebookmail\.com|facebook\.com|twitter\.com|x\.com|github\.com|atlassian\.net|jira\.com|asana\.com|slack\.com|trello\.com|notion\.so|canva\.com|figma\.com|zoom\.us|calendly\.com|stripe\.com|paypal\.com|square\.com|intuit\.com|xero\.com|hubspot\.com|mailchimp\.com|sendgrid\.net|googleusercontent\.com|google\.com\/a|accounts\.google\.com)/i.test(from)) {
    return 'automated'
  }

  return 'human'
}

/**
 * Normalize headers to lowercase, with safe access.
 */
function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key === 'string' && typeof value === 'string') {
      normalized[key.toLowerCase().trim()] = value.toLowerCase().trim()
    }
  }
  return normalized
}

/**
 * Analyze content for marketing/spam signals.
 */
export function analyzeContentSignals(
  html: string | null | undefined,
  text: string | null | undefined,
  recipientName?: string | null,
): ContentSignals {
  const htmlContent = html || ''
  const textContent = text || ''
  const totalLength = htmlContent.length + textContent.length

  // HTML ratio
  const htmlRatio = totalLength > 0 ? htmlContent.length / totalLength : 0

  // Track pixel detection (1x1 images are typically tracking pixels)
  const trackingPixelRegex = /<img[^>]*width\s*=\s*["']?1["']?[^>]*height\s*=\s*["']?1["']?[^>]*>/gi
  const hasTrackingPixels = trackingPixelRegex.test(htmlContent)

  // Unsubscribe link
  const hasUnsubscribeLink = /unsubscribe/i.test(htmlContent + textContent)

  // Image count
  const imgRegex = /<img/gi
  const imageCount = (htmlContent.match(imgRegex) || []).length

  // Link density
  const linkRegex = /href=["'][^"']+["']/gi
  const linkCount = (htmlContent.match(linkRegex) || []).length
  const linkDensity = totalLength > 100 ? linkCount / (totalLength / 100) : 0

  // Personal greeting detection
  let personalGreeting = false
  if (recipientName) {
    const nameRegex = new RegExp(`\\b${recipientName.split(' ')[0]}\\b`, 'i')
    personalGreeting = nameRegex.test(textContent)
  }
  if (!personalGreeting) {
    personalGreeting = /^(Hi|Hello|Dear|Hey)\s+\w+/im.test(textContent)
  }

  return {
    htmlRatio,
    linkDensity: Math.min(linkDensity, 1), // cap at 1
    hasUnsubscribeLink,
    hasTrackingPixels,
    imageCount,
    personalGreeting,
  }
}

/**
 * Score actionability of human-sent messages.
 * Used for priority vs updates categorization.
 */
export function scoreActionability(
  text: string | null | undefined,
  metadata?: {
    isClient?: boolean
    isReply?: boolean
    userName?: string
  },
): ActionabilitySignals {
  const content = text || ''
  let score = 0

  // Question detection (+2)
  const hasQuestion = /\?$|^(who|what|when|where|why|how|can|could|would|should)\s+/im.test(content)
  if (hasQuestion) score += 2

  // Deadline detection (+3)
  const deadlinePatterns = /\b(by\s+(?:end of\s)?(?:friday|monday|tuesday|wednesday|thursday|saturday|sunday|next\s+week|eow|eom|EOD|ASAP|tonight|tomorrow|today)|due\s+(?:by|on)|deadline|until\s+\d{1,2}\/\d{1,2}|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2})/i
  const hasDeadline = deadlinePatterns.test(content)
  if (hasDeadline) score += 3

  // Directive detection (+2) - imperative mood
  const directivePatterns = /\b(please\s+(?:review|check|send|update|let|provide|confirm|approve)|send\s+me|update\s+the|let\s+me\s+know|can\s+you|will\s+you|need\s+to|must\s+)/i
  const hasDirective = directivePatterns.test(content)
  if (hasDirective) score += 2

  // Urgency language (+2)
  const urgencyPatterns = /\b(urgent|ASAP|asap|time[- ]?sensitive|critical|immediately|right\s+away|URGENT)\b/
  const hasUrgency = urgencyPatterns.test(content)
  if (hasUrgency) score += 2

  // @mention of user (+3)
  const hasMention = metadata?.userName
    ? new RegExp(`@${metadata.userName}|@\w+`, 'i').test(content)
    : /@\w+/.test(content)
  if (hasMention) score += 3

  // Is reply to user (+1)
  const isReplyToUser = metadata?.isReply ?? false
  if (isReplyToUser) score += 1

  // Known client (+2)
  const isKnownClient = metadata?.isClient ?? false
  if (isKnownClient) score += 2

  // Outstanding invoice (+1) — would need to be passed via metadata
  const hasOutstandingInvoice = false // always false here, caller must set this

  // Determine category based on score
  let category: 'priority' | 'updates' | 'low'
  if (score >= 4) category = 'priority'
  else if (score >= 2) category = 'updates'
  else category = 'low'

  return {
    hasQuestion,
    hasDeadline,
    hasDirective,
    hasUrgency,
    hasMention,
    isReplyToUser,
    isKnownClient,
    hasOutstandingInvoice,
    score,
    category,
  }
}


// ---------------------------------------------------------------------------
// Smart Contact Creation Rules
// ---------------------------------------------------------------------------

export interface ShouldCreateContactInput {
  senderType: SenderType
  senderEmail: string | null
  messageCount?: number // total messages from this sender
  userReplied?: boolean // did user email them first?
  isNoReplyAddress?: boolean
}

/**
 * Determine if a contact should be created for this sender.
 * Implements rules to stop auto-creating contacts for every sender.
 *
 * CREATE if:
 * 1. User emailed them first AND they replied
 * 2. 2+ inbound messages from this sender
 *
 * NEVER create for:
 * - Automated senders (senderType !== 'human')
 * - No-reply addresses
 *
 * Otherwise: HOLD as transient sender in metadata
 */
export function shouldCreateContact(input: ShouldCreateContactInput): boolean {
  // Rule: NEVER create for non-human senders
  if (input.senderType !== 'human') {
    return false
  }

  // Rule: NEVER create for no-reply addresses
  if (input.isNoReplyAddress) {
    return false
  }

  // Rule: CREATE if user initiated AND got reply
  if (input.userReplied) {
    return true
  }

  // Rule: CREATE if 2+ inbound messages
  if ((input.messageCount ?? 0) >= 2) {
    return true
  }

  // Otherwise: don't create (hold as transient)
  return false
}

const DEFAULT_RESULT: ClassificationResult = {
  significance: 2,
  timeSensitivity: 'none',
  resolves: [],
  unblocks: [],
  recommendedActions: [],
  reasoning: 'Classification failed -- defaulting to low significance',
  category: 'notification',
  summary: '',
}

const MAX_BODY_LENGTH = 2000

function buildClassificationPrompt(message: ChannelMessage, contextSummary: string): string {
  const body = message.body.length > MAX_BODY_LENGTH
    ? message.body.slice(0, MAX_BODY_LENGTH) + '...[truncated]'
    : message.body

  return `Classify this message. Return ONLY valid JSON matching the schema below.

Message:
- Sender: ${message.sender}${message.senderEmail ? ` <${message.senderEmail}>` : ''}
- Subject: ${message.subject ?? '(no subject)'}
- Body: ${body}

Return JSON:
{
  "significance": <1-10>,
  "timeSensitivity": "<immediate|today|this_week|whenever|none>",
  "resolves": ["<task_id>", ...],
  "unblocks": ["<task_id>", ...],
  "recommendedActions": ["<action1>", ...],
  "reasoning": "<brief explanation>",
  "category": "<lead|client|vendor|personal|spam|notification|newsletter>",
  "summary": "<1-2 sentence plain-English summary of what this message says and any action needed>"
}

Background Context for Sender:
${contextSummary || 'None available.'}

Scoring guidelines:
- 10: Business-critical (contract, legal, payment dispute)
- 7-9: Important client/lead communication
- 4-6: Routine business (status updates, scheduling)
- 1-3: Newsletter, spam, noise, automated notifications`
}

function parseClassificationResponse(text: string): ClassificationResult {
  // Extract JSON from response -- handle markdown code blocks
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response')

  const parsed = JSON.parse(jsonMatch[0])

  // Validate and clamp significance
  const significance = Math.max(1, Math.min(10, Math.round(Number(parsed.significance) || 2)))

  const validSensitivities = ['immediate', 'today', 'this_week', 'whenever', 'none'] as const
  const timeSensitivity = validSensitivities.includes(parsed.timeSensitivity)
    ? parsed.timeSensitivity
    : 'none'

  const validCategories = ['lead', 'client', 'vendor', 'personal', 'spam', 'notification', 'newsletter'] as const
  const category = validCategories.includes(parsed.category)
    ? parsed.category
    : 'notification'

  return {
    significance,
    timeSensitivity,
    resolves: Array.isArray(parsed.resolves) ? parsed.resolves : [],
    unblocks: Array.isArray(parsed.unblocks) ? parsed.unblocks : [],
    recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
    reasoning: String(parsed.reasoning ?? ''),
    category,
    summary: String(parsed.summary ?? ''),
  }
}

/**
 * Classify a message using Haiku for cost-optimized significance scoring.
 * Never throws -- returns default low-significance result on failure.
 */
export async function classifyMessage(
  supabase: SupabaseClient,
  message: ChannelMessage,
  orgId: string,
): Promise<ClassificationResult> {
  try {
    const client = new Anthropic()

    // Assemble context for the sender to enrich classification
    const query = `${message.sender} ${message.senderEmail || ''}`.trim()
    const context = await assembleContext(supabase, orgId, query)

    const prompt = buildClassificationPrompt(message, context.summary)

    const response = await client.messages.create({
      model: resolveModel('classification'),
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      logger.warn('[classifier] No text block in response')
      return DEFAULT_RESULT
    }

    const result = parseClassificationResponse(textBlock.text)

    // Store classification on the message row
    await supabase
      .from('channel_messages')
      .update({
        significance: result.significance,
        time_sensitivity: result.timeSensitivity,
        resolves: result.resolves,
        unblocks: result.unblocks,
        recommended_actions: result.recommendedActions,
        classification_model: resolveModel('classification'),
        classified_at: new Date().toISOString(),
      })
      .eq('id', message.id)

    return result
  } catch (err) {
    logger.warn('[classifier] Classification failed:', err)
    return DEFAULT_RESULT
  }
}

// Exported for testing
export { buildClassificationPrompt, parseClassificationResponse, DEFAULT_RESULT }
