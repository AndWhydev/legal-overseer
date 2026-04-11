/**
 * Welcome Conversation Generator
 *
 * Template-based welcome message using real discovery data.
 * No LLM call -- pure data interpolation for speed.
 * Generates a personalized first message that proves BitBit already
 * knows the user's world.
 */

import type { FirstRunDiscoveryResult } from './first-run-discovery'

// ---- Types ----------------------------------------------------------------

export interface WelcomeMessageInput {
  userIdentity: FirstRunDiscoveryResult['userIdentity']
  topContacts: FirstRunDiscoveryResult['topContacts']
  activeThreads: FirstRunDiscoveryResult['activeThreads']
  insights: FirstRunDiscoveryResult['insights']
  connectedChannels: string[]
}

// ---- Generator -------------------------------------------------------------

/**
 * Generate a personalized welcome message using real discovery data.
 *
 * Rules:
 * 1. If contacts found: mention top 1-2 by name with context
 * 2. If threads needing reply: mention the most important one
 * 3. If overdue follow-ups: mention count and most notable
 * 4. If nothing useful: fall back to generic connected message
 * 5. Keep under 150 words
 * 6. Use markdown formatting
 * 7. End with actionable suggestion
 * 8. No LLM call -- pure template logic
 */
export function generateWelcomeMessage(input: WelcomeMessageInput): string {
  const { topContacts, activeThreads, insights, connectedChannels } = input

  const hasContacts = topContacts.length > 0
  const hasThreads = activeThreads.length > 0
  const hasInsights =
    insights.emailsNeedingReply > 0 ||
    insights.overdueFollowUps > 0

  // Fallback: no useful data discovered
  if (!hasContacts && !hasThreads && !hasInsights) {
    const channelList = connectedChannels.length > 0
      ? connectedChannels.join(' and ')
      : 'your email'
    return [
      `I'm connected to ${channelList} and ready to start learning your world.`,
      '',
      'As messages come in, I\'ll build a picture of your contacts, projects, and priorities.',
      '',
      'Ask me anything -- or just start working and I\'ll catch up in the background.',
    ].join('\n')
  }

  // Build the data-rich welcome message
  const lines: string[] = []
  const channelNames = connectedChannels.length > 0
    ? connectedChannels.join(' and ')
    : 'your email'

  lines.push(`I've scanned your last 30 days across ${channelNames}. Here's what I found:`)
  lines.push('')

  // Emails needing reply (highest priority)
  if (insights.emailsNeedingReply > 0) {
    const threadNeedingReply = activeThreads.find(t => t.needsReply)
    if (threadNeedingReply) {
      const participant = threadNeedingReply.participants[0] ?? 'someone'
      const contactName = findContactName(participant, topContacts)
      lines.push(
        `- **${insights.emailsNeedingReply} email${insights.emailsNeedingReply > 1 ? 's' : ''} need${insights.emailsNeedingReply === 1 ? 's' : ''} a reply** -- including one from ${contactName} about "${threadNeedingReply.subject}"`,
      )
    } else {
      lines.push(
        `- **${insights.emailsNeedingReply} email${insights.emailsNeedingReply > 1 ? 's' : ''} need${insights.emailsNeedingReply === 1 ? 's' : ''} a reply**`,
      )
    }
  }

  // Top contact
  if (hasContacts) {
    const top = topContacts[0]
    lines.push(
      `- **${top.name}** has been your most active contact (${top.messageCount} messages this month)`,
    )
  }

  // Overdue follow-ups
  if (insights.overdueFollowUps > 0) {
    const staleThread = activeThreads.find(t => !t.needsReply)
    if (staleThread) {
      lines.push(
        `- The **"${staleThread.subject}"** thread has gone quiet -- want me to draft a follow-up?`,
      )
    } else {
      lines.push(
        `- **${insights.overdueFollowUps} thread${insights.overdueFollowUps > 1 ? 's' : ''} may need a follow-up** -- I can draft messages for you`,
      )
    }
  } else if (hasThreads && !insights.emailsNeedingReply) {
    // Mention an active thread if we haven't already
    const notable = activeThreads[0]
    lines.push(
      `- **"${notable.subject}"** is your most active thread with ${notable.participants.length} participant${notable.participants.length !== 1 ? 's' : ''}`,
    )
  }

  lines.push('')
  lines.push(
    "I'll keep learning in the background. Ask me anything about your emails, contacts, or schedule.",
  )

  return lines.join('\n')
}

// ---- Fallback Message (no discovery data) ----------------------------------

export function generateFallbackWelcomeMessage(): string {
  return [
    'Welcome to BitBit! Connect your email from Settings to let me start learning your world.',
    '',
    'Once connected, I\'ll scan your recent messages and get to know your contacts, projects, and priorities.',
    '',
    'In the meantime, ask me anything -- I\'m here to help.',
  ].join('\n')
}

// ---- Utilities -------------------------------------------------------------

function findContactName(
  email: string,
  contacts: WelcomeMessageInput['topContacts'],
): string {
  const match = contacts.find(
    c => c.email.toLowerCase() === email.toLowerCase(),
  )
  if (match) return match.name

  // Derive name from email
  const local = email.split('@')[0] ?? ''
  return local
    .split(/[._-]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
