import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockHandleIncomingMessage } = vi.hoisted(() => ({
  mockHandleIncomingMessage: vi.fn(),
}))

vi.mock('@/lib/whatsapp/conversation-manager', () => ({
  handleIncomingMessage: mockHandleIncomingMessage,
}))

import { processWhatsAppMessage } from '@/lib/channels/whatsapp-parser'

describe('processWhatsAppMessage entry behavior', () => {
  const mockSupabase = {} as any

  beforeEach(() => {
    mockHandleIncomingMessage.mockReset()
  })

  it('passes normalized text + sender to conversation manager', async () => {
    await processWhatsAppMessage(
      mockSupabase,
      'org-1',
      { sender_email: '+61411111111' },
      'invoice sezer for $200'
    )

    expect(mockHandleIncomingMessage).toHaveBeenCalledWith(
      mockSupabase,
      'org-1',
      '+61411111111',
      'invoice sezer for $200'
    )
  })

  it('prepends voice-note prefix before handing off', async () => {
    await processWhatsAppMessage(
      mockSupabase,
      'org-1',
      { sender_email: '+61411111111', metadata: { voice_note: true } },
      'remind me to call bob tomorrow'
    )

    expect(mockHandleIncomingMessage).toHaveBeenCalledWith(
      mockSupabase,
      'org-1',
      '+61411111111',
      '[Voice note] remind me to call bob tomorrow'
    )
  })

  it('warns and does not dispatch when sender is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await processWhatsAppMessage(
        mockSupabase,
        'org-1',
        { metadata: { voice_note: true } },
        'hello'
      )
    } finally {
      expect(warnSpy).toHaveBeenCalledWith('[whatsapp-parser] No phone number found in message row')
      warnSpy.mockRestore()
    }

    expect(mockHandleIncomingMessage).not.toHaveBeenCalled()
  })
})
