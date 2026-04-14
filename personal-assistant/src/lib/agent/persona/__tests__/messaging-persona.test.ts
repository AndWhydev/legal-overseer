import { describe, it, expect } from 'vitest'
import { buildMessagingPersona } from '../messaging-persona'

describe('buildMessagingPersona', () => {
  it('includes channel labels', () => {
    expect(buildMessagingPersona({ channel: 'sendblue' })).toContain('iMessage')
    expect(buildMessagingPersona({ channel: 'telegram' })).toContain('Telegram')
    expect(buildMessagingPersona({ channel: 'whatsapp' })).toContain('WhatsApp')
  })

  it('uses first name', () => {
    expect(buildMessagingPersona({ channel: 'sendblue', displayName: 'John Smith' })).toContain('texting John')
  })

  it('uses "them" without name', () => {
    expect(buildMessagingPersona({ channel: 'sendblue' })).toContain('texting them')
  })

  it('enforces 10 word limit', () => {
    expect(buildMessagingPersona({ channel: 'sendblue' })).toContain('10 WORDS')
  })

  it('includes human abbreviations', () => {
    const r = buildMessagingPersona({ channel: 'sendblue' })
    expect(r).toContain('rn')
    expect(r).toContain('ur')
    expect(r).toContain('gonna')
  })

  it('one thought per bubble', () => {
    expect(buildMessagingPersona({ channel: 'sendblue' })).toContain('ONE THOUGHT PER BUBBLE')
  })

  it('not a chatbot', () => {
    expect(buildMessagingPersona({ channel: 'sendblue' })).toContain('NOT an AI chatbot')
  })

  it('no formatting', () => {
    const r = buildMessagingPersona({ channel: 'sendblue' })
    expect(r).toContain('NO FORMATTING')
    expect(r).toContain('No markdown')
  })
})
