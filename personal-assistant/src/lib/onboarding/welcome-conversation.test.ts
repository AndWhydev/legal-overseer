import { describe, expect, it } from 'vitest'
import {
  generateWelcomeMessage,
  generateFallbackWelcomeMessage,
  type WelcomeMessageInput,
} from './welcome-conversation'

function makeInput(
  overrides: Partial<WelcomeMessageInput> = {},
): WelcomeMessageInput {
  return {
    userIdentity: { name: 'Andy', email: 'andy@company.com', company: 'Company' },
    topContacts: [],
    activeThreads: [],
    insights: {
      emailsNeedingReply: 0,
      overdueFollowUps: 0,
      staleContacts: 0,
      upcomingDeadlines: [],
    },
    connectedChannels: ['gmail'],
    ...overrides,
  }
}

describe('generateWelcomeMessage', () => {
  it('generates rich message with contacts, threads, and insights', () => {
    const input = makeInput({
      topContacts: [
        { name: 'Dave Johnson', email: 'dave@example.com', messageCount: 12, lastContact: '2026-03-20T10:00:00Z', relationship: 'frequent' },
        { name: 'Emma Wilson', email: 'emma@example.com', messageCount: 8, lastContact: '2026-03-19T10:00:00Z', relationship: 'frequent' },
        { name: 'Carlos Lima', email: 'carlos@example.com', messageCount: 4, lastContact: '2026-03-18T10:00:00Z', relationship: 'important' },
      ],
      activeThreads: [
        { subject: 'Website Redesign', participants: ['dave@example.com'], lastActivity: '2026-03-20T10:00:00Z', needsReply: true },
        { subject: 'Q2 Budget', participants: ['emma@example.com'], lastActivity: '2026-03-15T10:00:00Z', needsReply: false },
      ],
      insights: {
        emailsNeedingReply: 2,
        overdueFollowUps: 1,
        staleContacts: 0,
        upcomingDeadlines: [],
      },
    })

    const output = generateWelcomeMessage(input)

    // Should contain the top contact's name in bold
    expect(output).toContain('**Dave Johnson**')
    // Should mention the thread needing reply
    expect(output).toContain('Website Redesign')
    // Should reference the follow-up thread
    expect(output).toContain('Q2 Budget')
  })

  it('returns fallback when no useful data is available', () => {
    const input = makeInput({
      topContacts: [],
      activeThreads: [],
      insights: {
        emailsNeedingReply: 0,
        overdueFollowUps: 0,
        staleContacts: 0,
        upcomingDeadlines: [],
      },
      connectedChannels: ['gmail'],
    })

    const output = generateWelcomeMessage(input)

    expect(output).toContain('gmail')
    expect(output).toContain('ready to start learning')
  })

  it('mentions specific contact names in bold', () => {
    const input = makeInput({
      topContacts: [
        { name: 'Dave Johnson', email: 'dave@example.com', messageCount: 8, lastContact: '2026-03-20T10:00:00Z', relationship: 'frequent' },
      ],
      activeThreads: [],
      insights: {
        emailsNeedingReply: 0,
        overdueFollowUps: 0,
        staleContacts: 0,
        upcomingDeadlines: [],
      },
    })

    const output = generateWelcomeMessage(input)

    expect(output).toContain('**Dave Johnson**')
  })

  it('handles single email needing reply with singular grammar', () => {
    const input = makeInput({
      topContacts: [
        { name: 'Alice', email: 'alice@example.com', messageCount: 3, lastContact: '2026-03-20T10:00:00Z', relationship: 'recent' },
      ],
      activeThreads: [
        { subject: 'Invoice query', participants: ['alice@example.com'], lastActivity: '2026-03-20T10:00:00Z', needsReply: true },
      ],
      insights: {
        emailsNeedingReply: 1,
        overdueFollowUps: 0,
        staleContacts: 0,
        upcomingDeadlines: [],
      },
    })

    const output = generateWelcomeMessage(input)

    expect(output).toContain('1 email needs a reply')
    expect(output).not.toContain('1 emails')
  })

  it('handles multiple emails needing reply with plural grammar', () => {
    const input = makeInput({
      topContacts: [
        { name: 'Alice', email: 'alice@example.com', messageCount: 3, lastContact: '2026-03-20T10:00:00Z', relationship: 'recent' },
      ],
      activeThreads: [
        { subject: 'Invoice query', participants: ['alice@example.com'], lastActivity: '2026-03-20T10:00:00Z', needsReply: true },
      ],
      insights: {
        emailsNeedingReply: 3,
        overdueFollowUps: 0,
        staleContacts: 0,
        upcomingDeadlines: [],
      },
    })

    const output = generateWelcomeMessage(input)

    expect(output).toContain('3 emails need a reply')
  })

  it('stays under 150 words with rich input', () => {
    const input = makeInput({
      topContacts: [
        { name: 'Dave Johnson', email: 'dave@example.com', messageCount: 20, lastContact: '2026-03-20T10:00:00Z', relationship: 'frequent' },
        { name: 'Emma Wilson', email: 'emma@example.com', messageCount: 15, lastContact: '2026-03-19T10:00:00Z', relationship: 'frequent' },
      ],
      activeThreads: [
        { subject: 'Website Redesign Project Discussion', participants: ['dave@example.com'], lastActivity: '2026-03-20T10:00:00Z', needsReply: true },
        { subject: 'Quarterly Budget Planning Session', participants: ['emma@example.com'], lastActivity: '2026-03-14T10:00:00Z', needsReply: false },
      ],
      insights: {
        emailsNeedingReply: 5,
        overdueFollowUps: 2,
        staleContacts: 1,
        upcomingDeadlines: [],
      },
      connectedChannels: ['gmail', 'google-calendar'],
    })

    const output = generateWelcomeMessage(input)
    const wordCount = output.split(/\s+/).length

    expect(wordCount).toBeLessThanOrEqual(150)
  })
})

describe('generateFallbackWelcomeMessage', () => {
  it('returns generic message mentioning Settings', () => {
    const output = generateFallbackWelcomeMessage()

    expect(output).toContain('Connect your email from Settings')
    expect(output).toContain('Welcome to BitBit')
  })
})
