import { describe, it, expect } from 'vitest'
import { smsConversationAdapter } from './sms-adapter'
import type { InboundSMS } from '@/lib/channels/sms'

function makeSMS(overrides: Partial<InboundSMS> = {}): InboundSMS {
  return {
    id: 'sms-1',
    from: '+61412345678',
    to: '+61400000000',
    text: 'Hey Bit, prepare an invoice for Dave kitchen job $4500',
    timestamp: new Date('2026-03-09T10:00:00Z'),
    ...overrides,
  }
}

describe('smsConversationAdapter', () => {
  it('normalizes an inbound SMS into ConversationCommandRequest', () => {
    const result = smsConversationAdapter.normalize({
      orgId: 'org-1',
      sms: makeSMS(),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.request.channel).toBe('sms')
    expect(result.request.orgId).toBe('org-1')
    expect(result.request.participantId).toBe('+61412345678')
    expect(result.request.text).toBe('Hey Bit, prepare an invoice for Dave kitchen job $4500')
    expect(result.request.metadata).toEqual({
      to: '+61400000000',
      timestamp: '2026-03-09T10:00:00.000Z',
    })
  })

  it('returns error when no sender phone', () => {
    const result = smsConversationAdapter.normalize({
      orgId: 'org-1',
      sms: makeSMS({ from: '' }),
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('missing_participant')
  })
})
