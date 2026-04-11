import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isComposioEnabledForChannel, createComposioAdapter } from '../adapter'

describe('composio/adapter', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('isComposioEnabledForChannel', () => {
    it('returns false when COMPOSIO_API_KEY is not set', () => {
      delete process.env.COMPOSIO_API_KEY
      delete process.env.COMPOSIO_ENABLE_GMAIL
      expect(isComposioEnabledForChannel('gmail')).toBe(false)
    })

    it('returns false for non-Composio channels', () => {
      process.env.COMPOSIO_API_KEY = 'test-key'
      expect(isComposioEnabledForChannel('imessage')).toBe(false)
      expect(isComposioEnabledForChannel('whatsapp')).toBe(false)
      expect(isComposioEnabledForChannel('sms')).toBe(false)
    })

    it('returns false when channel flag is not set', () => {
      process.env.COMPOSIO_API_KEY = 'test-key'
      delete process.env.COMPOSIO_ENABLE_GMAIL
      expect(isComposioEnabledForChannel('gmail')).toBe(false)
    })

    it('returns true when API key and channel flag are set', () => {
      process.env.COMPOSIO_API_KEY = 'test-key'
      process.env.COMPOSIO_ENABLE_GMAIL = '1'
      expect(isComposioEnabledForChannel('gmail')).toBe(true)
    })

    it('returns false when COMPOSIO_DISABLE_ALL is set', () => {
      process.env.COMPOSIO_API_KEY = 'test-key'
      process.env.COMPOSIO_ENABLE_GMAIL = '1'
      process.env.COMPOSIO_DISABLE_ALL = '1'
      expect(isComposioEnabledForChannel('gmail')).toBe(false)
    })
  })

  describe('createComposioAdapter', () => {
    it('returns null for non-Composio channels', () => {
      expect(createComposioAdapter('imessage')).toBeNull()
      expect(createComposioAdapter('whatsapp')).toBeNull()
    })

    it('returns a ChannelAdapter for Composio channels', () => {
      const adapter = createComposioAdapter('gmail')
      expect(adapter).not.toBeNull()
      expect(adapter!.type).toBe('gmail')
      expect(adapter!.name).toContain('Composio')
    })

    it('adapter has pull and isAvailable methods', () => {
      const adapter = createComposioAdapter('asana')
      expect(adapter).not.toBeNull()
      expect(typeof adapter!.pull).toBe('function')
      expect(typeof adapter!.isAvailable).toBe('function')
    })

    it('pull returns empty array when no orgId in config', async () => {
      const adapter = createComposioAdapter('gmail')!
      const messages = await adapter.pull({})
      expect(messages).toEqual([])
    })
  })
})
