import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getOrCreateMCPSession,
  invalidateMCPSession,
  isMCPEnabled,
  type MCPSession,
} from '../mcp-session'

describe('composio/mcp-session', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    invalidateMCPSession('*') // Clear all cached sessions
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('isMCPEnabled', () => {
    it('returns false when COMPOSIO_MCP_ENABLED is not set', () => {
      delete process.env.COMPOSIO_MCP_ENABLED
      expect(isMCPEnabled()).toBe(false)
    })

    it('returns false when COMPOSIO_API_KEY is not set', () => {
      process.env.COMPOSIO_MCP_ENABLED = '1'
      delete process.env.COMPOSIO_API_KEY
      expect(isMCPEnabled()).toBe(false)
    })

    it('returns true when both env vars are set', () => {
      process.env.COMPOSIO_MCP_ENABLED = '1'
      process.env.COMPOSIO_API_KEY = 'test-key'
      expect(isMCPEnabled()).toBe(true)
    })
  })

  describe('getOrCreateMCPSession', () => {
    it('returns null when MCP is not enabled', async () => {
      delete process.env.COMPOSIO_MCP_ENABLED
      const session = await getOrCreateMCPSession('org-1')
      expect(session).toBeNull()
    })
  })

  describe('invalidateMCPSession', () => {
    it('clears session for specific org', () => {
      // Should not throw
      invalidateMCPSession('org-1')
    })

    it('clears all sessions with wildcard', () => {
      // Should not throw
      invalidateMCPSession('*')
    })
  })
})
