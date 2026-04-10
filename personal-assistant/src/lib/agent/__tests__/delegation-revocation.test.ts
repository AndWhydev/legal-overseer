import { describe, it, expect, vi } from 'vitest'
import {
  detectDelegationIntent,
  resolveEntityFromMention,
  generateRevocationConfirmation,
} from '../delegation-intent'
import { revokeEntityMandate } from '../delegation-mandate'

// ---------------------------------------------------------------------------
// Mock helpers (mirror delegation-mandate.test.ts style)
// ---------------------------------------------------------------------------

function createMockChain(overrides: Record<string, unknown> = {}) {
  const defaults = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    ilike: vi.fn(),
    contains: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  }
  const fns = { ...defaults, ...overrides }
  for (const key of Object.keys(fns)) {
    if (!overrides[key]) {
      fns[key as keyof typeof fns] = vi.fn().mockReturnValue(fns)
    }
  }
  return fns
}

function mockSupabaseForRevoke(
  data: Record<string, unknown>[] | null,
  error: { message: string } | null = null,
) {
  const chain = createMockChain({
    select: vi.fn().mockResolvedValue({ data, error }),
  })
  return { from: vi.fn().mockReturnValue(chain), _chain: chain } as any
}

// ---------------------------------------------------------------------------
// Tests: Revocation intent → mandate deactivation → standard routing
// ---------------------------------------------------------------------------

describe('delegation revocation integration', () => {
  it('detects revocation intent and returns correct type', () => {
    const result = detectDelegationIntent('Stop managing Steve')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('revoke')
    expect(result!.entityMention).toBe('Steve')
    expect(result!.confidence).toBeGreaterThanOrEqual(0.6)
  })

  it('revokeEntityMandate deactivates an active mandate', async () => {
    const supabase = mockSupabaseForRevoke([{ id: 'mandate-1' }])
    const revoked = await revokeEntityMandate(supabase, 'org-1', 'entity-1', 'whatsapp')
    expect(revoked).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('delegation_mandates')
  })

  it('revokeEntityMandate returns false when no active mandate exists', async () => {
    const supabase = mockSupabaseForRevoke([])
    const revoked = await revokeEntityMandate(supabase, 'org-1', 'entity-1', 'whatsapp')
    expect(revoked).toBe(false)
  })

  it('generates a confirmation that signals return to standard routing', () => {
    const msg = generateRevocationConfirmation('Steve')
    expect(msg).toContain('Steve')
    expect(msg).toContain('back')
    expect(msg).toContain('directly')
  })

  it('multiple revocation phrases all resolve to the same entity mention', () => {
    const phrases = [
      'Stop managing Steve',
      'Take Steve back',
      'Take Steve off autopilot',
      'No longer manage Steve',
      "I'll handle Steve myself",
    ]

    for (const phrase of phrases) {
      const result = detectDelegationIntent(phrase)
      expect(result, `Failed for: "${phrase}"`).not.toBeNull()
      expect(result!.type).toBe('revoke')
      expect(result!.entityMention).toBe('Steve')
    }
  })

  it('revocation with multi-word entity names preserves the full name', () => {
    const result = detectDelegationIntent('Stop managing Acme Corp')
    expect(result).not.toBeNull()
    expect(result!.entityMention).toBe('Acme Corp')
  })

  it('revocation returns null for non-revocation messages about an entity', () => {
    expect(detectDelegationIntent('How is Steve doing?')).toBeNull()
    expect(detectDelegationIntent('Send a message to Steve')).toBeNull()
    expect(detectDelegationIntent('What did Steve say?')).toBeNull()
  })
})
