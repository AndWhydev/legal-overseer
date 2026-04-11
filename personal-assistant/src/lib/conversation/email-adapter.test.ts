import { describe, it, expect } from 'vitest'
import { emailConversationAdapter } from './email-adapter'
import type { ChannelMessage } from '@/lib/channels/types'

function makeEmail(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg-1',
    channel: 'gmail',
    externalId: 'ext-1',
    sender: 'Dave Smith',
    senderEmail: 'dave@example.com',
    subject: '[BitBit] Create invoice for kitchen job',
    body: 'Dave owes $4,500 for the kitchen renovation.\n\n-- \nSent from my iPhone',
    receivedAt: new Date(),
    isActionable: true,
    priority: 'medium',
    metadata: {},
    ...overrides,
  }
}

describe('emailConversationAdapter', () => {
  it('normalizes a command email into ConversationCommandRequest', () => {
    const result = emailConversationAdapter.normalize({
      orgId: 'org-1',
      email: makeEmail(),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.request.channel).toBe('email')
    expect(result.request.orgId).toBe('org-1')
    expect(result.request.participantId).toBe('dave@example.com')
    expect(result.request.text).toContain('Create invoice for kitchen job')
    expect(result.request.text).toContain('Dave owes $4,500')
    // Signature should be stripped
    expect(result.request.text).not.toContain('Sent from my iPhone')
  })

  it('strips Re:/Fwd: prefixes from subject', () => {
    const result = emailConversationAdapter.normalize({
      orgId: 'org-1',
      email: makeEmail({ subject: 'RE: FWD: Check invoice status' }),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.request.text).toContain('Check invoice status')
    expect(result.request.text).not.toContain('RE:')
    expect(result.request.text).not.toContain('FWD:')
  })

  it('returns error when no sender email', () => {
    const result = emailConversationAdapter.normalize({
      orgId: 'org-1',
      email: makeEmail({ senderEmail: undefined, sender: '' }),
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('missing_participant')
  })

  it('falls back to sender name as participant when no email', () => {
    const result = emailConversationAdapter.normalize({
      orgId: 'org-1',
      email: makeEmail({ senderEmail: undefined, sender: 'Dave' }),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.request.participantId).toBe('Dave')
  })

  it('handles email with subject only (no body)', () => {
    const result = emailConversationAdapter.normalize({
      orgId: 'org-1',
      email: makeEmail({ body: '' }),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.request.text).toBe('Create invoice for kitchen job')
    expect(result.request.text).not.toContain('Context:')
  })
})
