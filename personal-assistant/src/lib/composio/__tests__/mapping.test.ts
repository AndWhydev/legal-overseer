import { describe, it, expect } from 'vitest'
import {
  COMPOSIO_TOOLKIT_MAP,
  CUSTOM_ONLY_CHANNELS,
  isComposioChannel,
  getToolkitId,
  getComposioChannels,
} from '../mapping'

describe('composio/mapping', () => {
  describe('COMPOSIO_TOOLKIT_MAP', () => {
    it('maps gmail to gmail toolkit', () => {
      expect(COMPOSIO_TOOLKIT_MAP.gmail).toBe('gmail')
    })

    it('maps calendar to googlecalendar toolkit', () => {
      expect(COMPOSIO_TOOLKIT_MAP.calendar).toBe('googlecalendar')
    })

    it('maps all expected channels', () => {
      const expected = [
        'gmail', 'outlook', 'calendar', 'asana', 'calendly',
        'stripe', 'slack', 'xero', 'instagram', 'facebook',
        'telegram', 'clickup', 'wordpress', 'ga4', 'gsc',
      ]
      for (const channel of expected) {
        expect(COMPOSIO_TOOLKIT_MAP[channel as keyof typeof COMPOSIO_TOOLKIT_MAP]).toBeDefined()
      }
    })

    it('does not include custom-only channels', () => {
      for (const channel of CUSTOM_ONLY_CHANNELS) {
        expect(COMPOSIO_TOOLKIT_MAP[channel as keyof typeof COMPOSIO_TOOLKIT_MAP]).toBeUndefined()
      }
    })
  })

  describe('isComposioChannel', () => {
    it('returns true for Composio-supported channels', () => {
      expect(isComposioChannel('gmail')).toBe(true)
      expect(isComposioChannel('asana')).toBe(true)
      expect(isComposioChannel('stripe')).toBe(true)
    })

    it('returns false for custom-only channels', () => {
      expect(isComposioChannel('imessage')).toBe(false)
      expect(isComposioChannel('whatsapp')).toBe(false)
      expect(isComposioChannel('sms')).toBe(false)
    })
  })

  describe('getToolkitId', () => {
    it('returns toolkit ID for mapped channels', () => {
      expect(getToolkitId('gmail')).toBe('gmail')
      expect(getToolkitId('xero')).toBe('xero')
    })

    it('returns undefined for unmapped channels', () => {
      expect(getToolkitId('imessage')).toBeUndefined()
    })
  })

  describe('getComposioChannels', () => {
    it('returns all Composio-compatible channel types', () => {
      const channels = getComposioChannels()
      expect(channels.length).toBe(15)
      expect(channels).toContain('gmail')
      expect(channels).toContain('slack')
      expect(channels).not.toContain('imessage')
    })
  })
})
