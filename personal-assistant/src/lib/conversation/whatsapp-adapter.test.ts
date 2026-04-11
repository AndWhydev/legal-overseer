import { describe, it, expect } from 'vitest'
import { whatsappConversationAdapter } from './whatsapp-adapter'

describe('whatsappConversationAdapter', () => {
  it('normalizes a standard text message', () => {
    const result = whatsappConversationAdapter.normalize({
      orgId: 'org-1',
      messageRow: { sender_email: '+61400000000' },
      text: 'hello there',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.request.channel).toBe('whatsapp')
    expect(result.request.orgId).toBe('org-1')
    expect(result.request.participantId).toBe('+61400000000')
    expect(result.request.text).toBe('hello there')
  })

  it('prepends voice-note prefix when metadata.voice_note=true', () => {
    const result = whatsappConversationAdapter.normalize({
      orgId: 'org-1',
      messageRow: {
        sender_email: '+61400000000',
        metadata: { voice_note: true },
      },
      text: 'call bob tomorrow',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.request.text).toBe('[Voice note] call bob tomorrow')
  })

  it('returns missing_participant when sender is absent', () => {
    const result = whatsappConversationAdapter.normalize({
      orgId: 'org-1',
      messageRow: { metadata: { voice_note: true } },
      text: 'hello',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('missing_participant')
  })
})
