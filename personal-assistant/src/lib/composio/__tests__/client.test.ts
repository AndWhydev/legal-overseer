import { describe, it, expect, afterEach } from 'vitest'
import { isComposioEnabled } from '../client'

describe('composio/client', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('isComposioEnabled', () => {
    it('returns false when COMPOSIO_API_KEY is not set', () => {
      delete process.env.COMPOSIO_API_KEY
      expect(isComposioEnabled()).toBe(false)
    })

    it('returns true when COMPOSIO_API_KEY is set', () => {
      process.env.COMPOSIO_API_KEY = 'test-key-123'
      expect(isComposioEnabled()).toBe(true)
    })
  })
})
