import { describe, it, expect } from 'vitest'
import {
  detectDelegationIntent,
  generateActivationConfirmation,
  generateRevocationConfirmation,
  ACTIVATION_PATTERNS,
  REVOCATION_PATTERNS,
} from '../delegation-intent'

// ---------------------------------------------------------------------------
// detectDelegationIntent — Activation patterns
// ---------------------------------------------------------------------------

describe('detectDelegationIntent — activation', () => {
  it('detects "take X off my hands"', () => {
    const result = detectDelegationIntent('Take Steve off my hands')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('activate')
    expect(result!.entityMention).toBe('Steve')
    expect(result!.confidence).toBeGreaterThanOrEqual(0.7)
  })

  it('detects "manage X for me"', () => {
    const result = detectDelegationIntent('Manage Acme Corp for me')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('activate')
    expect(result!.entityMention).toBe('Acme Corp')
  })

  it('detects "put X on autopilot"', () => {
    const result = detectDelegationIntent('Put the Johnson account on autopilot')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('activate')
    expect(result!.entityMention).toBe('Johnson account')
  })

  it('detects "handle X from now on"', () => {
    const result = detectDelegationIntent('Handle Sarah from now on')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('activate')
    expect(result!.entityMention).toBe('Sarah')
  })

  it('detects "delegate X to you"', () => {
    const result = detectDelegationIntent('Delegate my client Bob to you')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('activate')
    expect(result!.entityMention).toBe('client Bob')
  })

  it('detects "take over X"', () => {
    const result = detectDelegationIntent('Take over Dave')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('activate')
    expect(result!.entityMention).toBe('Dave')
  })

  it('boosts confidence for short direct commands', () => {
    const short = detectDelegationIntent('Take Steve off my hands')
    const long = detectDelegationIntent(
      'I was thinking about this for a while and after careful consideration I would like you to take Steve off my hands because I have too much on my plate and honestly I just cannot manage everything at once anymore',
    )
    expect(short).not.toBeNull()
    expect(long).not.toBeNull()
    expect(short!.confidence).toBeGreaterThan(long!.confidence)
  })
})

// ---------------------------------------------------------------------------
// detectDelegationIntent — Revocation patterns
// ---------------------------------------------------------------------------

describe('detectDelegationIntent — revocation', () => {
  it('detects "stop managing X"', () => {
    const result = detectDelegationIntent('Stop managing Steve')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('revoke')
    expect(result!.entityMention).toBe('Steve')
  })

  it('detects "take X back"', () => {
    const result = detectDelegationIntent('Take Steve back')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('revoke')
    expect(result!.entityMention).toBe('Steve')
  })

  it('detects "revoke delegation for X"', () => {
    const result = detectDelegationIntent('Revoke delegation for Acme Corp')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('revoke')
    expect(result!.entityMention).toBe('Acme Corp')
  })

  it('detects "take X off autopilot"', () => {
    const result = detectDelegationIntent('Take the Johnson account off autopilot')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('revoke')
    expect(result!.entityMention).toBe('Johnson account')
  })
})

// ---------------------------------------------------------------------------
// detectDelegationIntent — negative cases
// ---------------------------------------------------------------------------

describe('detectDelegationIntent — no match', () => {
  it('returns null for unrelated messages', () => {
    expect(detectDelegationIntent('What is the weather today?')).toBeNull()
    expect(detectDelegationIntent('Send an invoice to Steve')).toBeNull()
    expect(detectDelegationIntent('How is the project going?')).toBeNull()
    expect(detectDelegationIntent('')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Confirmation generators
// ---------------------------------------------------------------------------

describe('generateActivationConfirmation', () => {
  it('includes the entity name', () => {
    const msg = generateActivationConfirmation('Steve')
    expect(msg).toContain('Steve')
  })

  it('mentions how to revoke', () => {
    const msg = generateActivationConfirmation('Acme Corp')
    expect(msg).toContain('stop managing Acme Corp')
  })
})

describe('generateRevocationConfirmation', () => {
  it('includes the entity name', () => {
    const msg = generateRevocationConfirmation('Steve')
    expect(msg).toContain('Steve')
  })

  it('signals the user is back in control', () => {
    const msg = generateRevocationConfirmation('Dave')
    expect(msg).toContain('back')
  })
})

// ---------------------------------------------------------------------------
// Pattern coverage sanity check
// ---------------------------------------------------------------------------

describe('pattern coverage', () => {
  it('has at least 7 activation patterns', () => {
    expect(ACTIVATION_PATTERNS.length).toBeGreaterThanOrEqual(7)
  })

  it('has at least 7 revocation patterns', () => {
    expect(REVOCATION_PATTERNS.length).toBeGreaterThanOrEqual(7)
  })
})
