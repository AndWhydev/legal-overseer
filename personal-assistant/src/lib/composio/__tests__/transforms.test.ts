import { describe, it, expect } from 'vitest'
import { createComposioAdapter } from '../adapter'

describe('composio/transforms', () => {
  describe('per-channel adapters', () => {
    const channels = [
      'gmail', 'outlook', 'calendar', 'asana', 'calendly', 'stripe',
      'slack', 'xero', 'clickup', 'instagram', 'facebook', 'wordpress',
      'telegram', 'ga4', 'gsc',
    ] as const

    for (const channel of channels) {
      it(`creates adapter for ${channel}`, () => {
        const adapter = createComposioAdapter(channel)
        expect(adapter).not.toBeNull()
        expect(adapter!.type).toBe(channel)
        expect(adapter!.name).toContain('Composio')
      })
    }

    it('all adapters have pull and isAvailable', () => {
      for (const channel of channels) {
        const adapter = createComposioAdapter(channel)!
        expect(typeof adapter.pull).toBe('function')
        expect(typeof adapter.isAvailable).toBe('function')
      }
    })
  })

  describe('custom-only channels', () => {
    it('returns null for imessage', () => {
      expect(createComposioAdapter('imessage')).toBeNull()
    })

    it('returns null for whatsapp', () => {
      expect(createComposioAdapter('whatsapp')).toBeNull()
    })

    it('returns null for sms', () => {
      expect(createComposioAdapter('sms')).toBeNull()
    })

    it('returns null for sendblue', () => {
      expect(createComposioAdapter('sendblue')).toBeNull()
    })
  })
})
