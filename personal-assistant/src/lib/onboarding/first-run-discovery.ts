/**
 * First-Run Discovery Pipeline
 *
 * Lightweight 30-day channel scan that builds:
 * - User identity (name, email, company from sent email headers)
 * - Top contacts (frequency-ranked, top 10)
 * - Active threads (grouped by subject, top 10)
 * - Actionable insights (needs reply, overdue follow-ups)
 *
 * Pure data extraction -- no LLM call. Target: <60 seconds.
 * The full Opus synthesis fires in the background AFTER this completes.
 */

import { logger } from '@/lib/core/logger'
import { crawlAllChannels, type CrawledMessage, type CrawlProgress } from './intelligence-crawl'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---- Types ----------------------------------------------------------------

export interface FirstRunDiscoveryResult {
  userIdentity: {
    name: string
    email: string
    company: string
  }
  topContacts: Array<{
    name: string
    email: string
    messageCount: number
    lastContact: string
    relationship: 'frequent' | 'recent' | 'important'
  }>
  activeThreads: Array<{
    subject: string
    participants: string[]
    lastActivity: string
    needsReply: boolean
  }>
  stats: {
    totalMessages: number
    channelBreakdown: Record<string, number>
    scanDurationMs: number
  }
  insights: {
    emailsNeedingReply: number
    overdueFollowUps: number
    staleContacts: number
    upcomingDeadlines: string[]
  }
}

export interface DiscoveryProgress {
  phase: 'scanning' | 'analyzing' | 'complete'
  detail: string
  messagesFound?: number
  contactsFound?: number
  threadsFound?: number
}

// ---- Helpers ---------------------------------------------------------------

/** Strip Re:/Fwd:/RE:/FW: prefixes and normalize whitespace */
function normalizeSubject(raw: string): string {
  return raw
    .replace(/^(?:re|fwd|fw)\s*:\s*/gi, '')
    .replace(/^(?:re|fwd|fw)\s*:\s*/gi, '') // double-strip for "Re: Fwd: ..."
    .trim()
}

/** Extract email address from "Name <email>" or bare "email" format */
function extractEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/)
  return (match ? match[1] : raw).trim().toLowerCase()
}

/** Extract display name from "Name <email>" format, or derive from email */
function extractName(raw: string): string {
  const match = raw.match(/^([^<]+)</)
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, '')
    if (name) return name
  }
  // Derive from email: "john.doe@example.com" -> "John Doe"
  const email = extractEmail(raw)
  const local = email.split('@')[0] ?? ''
  return local
    .split(/[._-]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Extract company domain from email address */
function extractCompany(email: string): string {
  const domain = email.split('@')[1] ?? ''
  // Skip common free email providers
  const freeProviders = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com',
    'outlook.com', 'live.com', 'icloud.com', 'me.com', 'aol.com',
    'protonmail.com', 'proton.me', 'mail.com', 'fastmail.com',
  ])
  if (freeProviders.has(domain)) return ''
  // Capitalize domain name portion: "allwebbedup.com" -> "Allwebbedup"
  const name = domain.split('.')[0] ?? ''
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// ---- Main Discovery --------------------------------------------------------

export async function runFirstRunDiscovery(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  onProgress?: (p: DiscoveryProgress) => void,
): Promise<FirstRunDiscoveryResult> {
  const start = Date.now()
  const progress = onProgress ?? (() => {})

  logger.info('[first-run-discovery] Starting lightweight 30-day scan', { orgId })

  // ---- Phase 1: Crawl (fast -- 1 month, 50 per channel) ------------------
  progress({ phase: 'scanning', detail: 'Scanning connected channels...' })

  const crawl = await crawlAllChannels(supabase, orgId, {
    monthsBack: 1,
    maxPerChannel: 50,
    onProgress: (p: CrawlProgress) => {
      if (p.status === 'crawling') {
        progress({ phase: 'scanning', detail: `Scanning ${p.channel}...` })
      } else if (p.status === 'done') {
        progress({
          phase: 'scanning',
          detail: `Found ${p.count} messages in ${p.channel}`,
          messagesFound: p.count,
        })
      }
    },
  })

  progress({
    phase: 'analyzing',
    detail: `Analyzing ${crawl.messages.length} messages...`,
    messagesFound: crawl.messages.length,
  })

  // ---- Phase 2: Extract user identity from sent emails --------------------
  const sentMessages = crawl.messages.filter(m => m.direction === 'sent')
  const receivedMessages = crawl.messages.filter(m => m.direction === 'received')

  const userEmail = crawl.accountEmail !== 'unknown'
    ? crawl.accountEmail
    : sentMessages.length > 0
      ? extractEmail(sentMessages[0].from)
      : ''

  const userName = sentMessages.length > 0
    ? extractName(sentMessages[0].from)
    : ''

  const userCompany = userEmail ? extractCompany(userEmail) : ''

  const userIdentity = {
    name: userName,
    email: userEmail,
    company: userCompany,
  }

  // ---- Phase 3: Build contact frequency map (top 10) ----------------------
  const contactMap = new Map<string, {
    name: string
    email: string
    count: number
    lastDate: string
    sentCount: number
    receivedCount: number
  }>()

  for (const msg of crawl.messages) {
    if (msg.direction === 'event') continue

    // For sent messages, track the recipient; for received, track the sender
    const counterpartyRaw = msg.direction === 'sent' ? msg.to : msg.from
    // May contain multiple recipients -- take first
    const firstRecipient = counterpartyRaw.split(',')[0].trim()
    const email = extractEmail(firstRecipient)

    // Skip self
    if (email === userEmail.toLowerCase()) continue
    if (!email || email === 'unknown') continue

    const existing = contactMap.get(email)
    if (existing) {
      existing.count++
      if (msg.direction === 'sent') existing.sentCount++
      else existing.receivedCount++
      if (msg.date > existing.lastDate) {
        existing.lastDate = msg.date
        // Update name if we got a better one
        const newName = extractName(firstRecipient)
        if (newName && newName !== email) existing.name = newName
      }
    } else {
      contactMap.set(email, {
        name: extractName(firstRecipient),
        email,
        count: 1,
        lastDate: msg.date,
        sentCount: msg.direction === 'sent' ? 1 : 0,
        receivedCount: msg.direction === 'received' ? 1 : 0,
      })
    }
  }

  const sortedContacts = [...contactMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const topContacts = sortedContacts.map(c => {
    let relationship: 'frequent' | 'recent' | 'important' = 'frequent'
    if (c.count <= 2 && c.lastDate > sevenDaysAgo) relationship = 'recent'
    else if (c.count >= 5) relationship = 'frequent'
    else relationship = 'important'

    return {
      name: c.name,
      email: c.email,
      messageCount: c.count,
      lastContact: c.lastDate,
      relationship,
    }
  })

  progress({
    phase: 'analyzing',
    detail: `Identified ${topContacts.length} key contacts`,
    messagesFound: crawl.messages.length,
    contactsFound: topContacts.length,
  })

  // ---- Phase 4: Group messages into threads (top 10 most recent) ----------
  const threadMap = new Map<string, {
    subject: string
    participants: Set<string>
    messages: CrawledMessage[]
    lastActivity: string
  }>()

  for (const msg of crawl.messages) {
    if (msg.direction === 'event') continue
    const normalized = normalizeSubject(msg.subject)
    if (!normalized) continue

    const key = normalized.toLowerCase()
    const existing = threadMap.get(key)
    if (existing) {
      existing.messages.push(msg)
      existing.participants.add(extractEmail(msg.from))
      if (msg.to) {
        for (const r of msg.to.split(',')) {
          const e = extractEmail(r.trim())
          if (e && e !== userEmail.toLowerCase()) existing.participants.add(e)
        }
      }
      if (msg.date > existing.lastActivity) existing.lastActivity = msg.date
    } else {
      const participants = new Set<string>()
      participants.add(extractEmail(msg.from))
      if (msg.to) {
        for (const r of msg.to.split(',')) {
          const e = extractEmail(r.trim())
          if (e) participants.add(e)
        }
      }
      threadMap.set(key, {
        subject: normalized,
        participants,
        messages: [msg],
        lastActivity: msg.date,
      })
    }
  }

  // Filter to threads with at least 2 messages, sort by most recent
  const activeThreads = [...threadMap.values()]
    .filter(t => t.messages.length >= 2)
    .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
    .slice(0, 10)
    .map(t => {
      // Determine needsReply: last message is from someone else
      const sorted = t.messages.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
      const lastMsg = sorted[0]
      const lastSenderEmail = extractEmail(lastMsg.from)
      const needsReply = lastMsg.direction === 'received'
        || lastSenderEmail !== userEmail.toLowerCase()

      return {
        subject: t.subject,
        participants: [...t.participants].filter(p => p !== userEmail.toLowerCase()),
        lastActivity: t.lastActivity,
        needsReply,
      }
    })

  progress({
    phase: 'analyzing',
    detail: `Mapped ${activeThreads.length} active threads`,
    messagesFound: crawl.messages.length,
    contactsFound: topContacts.length,
    threadsFound: activeThreads.length,
  })

  // ---- Phase 5: Compute insights ------------------------------------------
  // Emails needing reply: received in last 7 days with no sent response to that sender
  const recentReceivedSenders = new Set<string>()
  const recentSentRecipients = new Set<string>()

  for (const msg of crawl.messages) {
    if (msg.direction === 'event') continue
    if (msg.date < sevenDaysAgo) continue

    if (msg.direction === 'received') {
      recentReceivedSenders.add(extractEmail(msg.from))
    } else if (msg.direction === 'sent') {
      for (const r of msg.to.split(',')) {
        recentSentRecipients.add(extractEmail(r.trim()))
      }
    }
  }

  const emailsNeedingReply = [...recentReceivedSenders]
    .filter(sender => !recentSentRecipients.has(sender))
    .length

  // Overdue follow-ups: threads where user was last sender and no reply in 7+ days
  const overdueFollowUps = activeThreads.filter(t => {
    return !t.needsReply && t.lastActivity < sevenDaysAgo
  }).length

  // Stale contacts: contacts with no messages in last 14 days
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const staleContacts = topContacts.filter(c => c.lastContact < fourteenDaysAgo).length

  const insights = {
    emailsNeedingReply,
    overdueFollowUps,
    staleContacts,
    upcomingDeadlines: [], // Calendar integration can populate this later
  }

  // ---- Phase 6: Upsert top contacts into contacts table -------------------
  if (topContacts.length > 0) {
    try {
      for (const contact of topContacts) {
        const slug = contact.email.replace(/[^a-z0-9]/g, '-')
        await supabase
          .from('contacts')
          .upsert(
            {
              org_id: orgId,
              slug,
              name: contact.name,
              type: 'contact',
              emails: [contact.email],
              communication_patterns: {
                message_count: contact.messageCount,
                last_contact: contact.lastContact,
                relationship: contact.relationship,
                source: 'first-run-discovery',
              },
            },
            { onConflict: 'org_id,slug' },
          )
      }
      logger.info('[first-run-discovery] Upserted contacts', {
        orgId,
        count: topContacts.length,
      })
    } catch (err) {
      // Non-blocking -- dashboard will just have fewer contacts initially
      logger.warn('[first-run-discovery] Contact upsert failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ---- Phase 7: Store result in profile preferences -----------------------
  const result: FirstRunDiscoveryResult = {
    userIdentity,
    topContacts,
    activeThreads,
    stats: {
      totalMessages: crawl.messages.length,
      channelBreakdown: crawl.channelBreakdown,
      scanDurationMs: Date.now() - start,
    },
    insights,
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .single<{ preferences: Record<string, unknown> | null }>()

    const prefs = profile?.preferences ?? {}
    await supabase
      .from('profiles')
      .update({
        preferences: {
          ...prefs,
          first_run_discovery: result,
        },
      })
      .eq('id', userId)

    logger.info('[first-run-discovery] Stored discovery result in profile', { userId })
  } catch (err) {
    logger.warn('[first-run-discovery] Failed to store discovery result', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  progress({
    phase: 'complete',
    detail: 'Discovery complete',
    messagesFound: crawl.messages.length,
    contactsFound: topContacts.length,
    threadsFound: activeThreads.length,
  })

  logger.info('[first-run-discovery] Complete', {
    orgId,
    totalMessages: crawl.messages.length,
    contacts: topContacts.length,
    threads: activeThreads.length,
    durationMs: Date.now() - start,
  })

  return result
}
