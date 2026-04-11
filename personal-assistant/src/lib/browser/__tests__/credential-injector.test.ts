import { describe, it, expect, vi, beforeEach } from 'vitest'
import { injectCredentials } from '../credential-injector'

// ---------------------------------------------------------------------------
// Mock Stagehand session
// ---------------------------------------------------------------------------

function mockSession() {
  return {
    act: vi.fn().mockResolvedValue({ success: true }),
  } as any
}

// ---------------------------------------------------------------------------
// injectCredentials
// ---------------------------------------------------------------------------

describe('injectCredentials', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns success immediately for "none" source', async () => {
    const session = mockSession()
    const result = await injectCredentials(session, 'none', {})
    expect(result.success).toBe(true)
    expect(session.act).not.toHaveBeenCalled()
  })

  it('injects Composio credentials via act()', async () => {
    const session = mockSession()
    const result = await injectCredentials(session, 'composio', {
      composioConnectionId: 'conn-123',
      usernameSelector: '#email',
      passwordSelector: '#password',
    })
    expect(result.success).toBe(true)
    expect(session.act).toHaveBeenCalled()
  })

  it('returns error when composioConnectionId is missing', async () => {
    const session = mockSession()
    const result = await injectCredentials(session, 'composio', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('composioConnectionId')
  })

  it('returns error when 1password opSecretRef is missing', async () => {
    const session = mockSession()
    const result = await injectCredentials(session, '1password', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('opSecretRef')
  })

  it('handles act() failure gracefully', async () => {
    const session = mockSession()
    session.act.mockRejectedValue(new Error('element not found'))
    const result = await injectCredentials(session, 'composio', {
      composioConnectionId: 'conn-123',
      usernameSelector: '#email',
      passwordSelector: '#password',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('element not found')
  })

  it('returns error for unknown credential source', async () => {
    const session = mockSession()
    const result = await injectCredentials(session, 'unknown' as any, {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown credential source')
  })
})
