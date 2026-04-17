import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  assertOutboundAllowed,
  OutboundBlockedError,
  isDryRun,
} from '../guards'

describe('assertOutboundAllowed', () => {
  beforeEach(() => {
    vi.stubEnv('BITBIT_OUTBOUND_MODE', '')
    vi.stubEnv('SENDBLUE_DEV_ALLOWLIST', '')
    vi.stubEnv('NODE_ENV', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('production', () => {
    it('passes any recipient in production with no allowlist', () => {
      vi.stubEnv('NODE_ENV', 'production')
      expect(() => assertOutboundAllowed('+61412345678', 'sendblue')).not.toThrow()
    })

    it('ignores allowlist in production', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('SENDBLUE_DEV_ALLOWLIST', '+61499999999')
      expect(() => assertOutboundAllowed('+61412345678', 'sms')).not.toThrow()
    })
  })

  describe('non-production', () => {
    it('throws not-allowlisted when allowlist is empty', () => {
      vi.stubEnv('NODE_ENV', 'development')
      expect(() => assertOutboundAllowed('+61412345678', 'sendblue')).toThrow(OutboundBlockedError)
      try {
        assertOutboundAllowed('+61412345678', 'sendblue')
      } catch (err) {
        expect(err).toBeInstanceOf(OutboundBlockedError)
        expect((err as OutboundBlockedError).reason).toBe('not-allowlisted')
      }
    })

    it('throws when recipient is not in allowlist', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('SENDBLUE_DEV_ALLOWLIST', '+61499999999,+61488888888')
      expect(() => assertOutboundAllowed('+61412345678', 'whatsapp')).toThrow(OutboundBlockedError)
    })

    it('passes recipient that is in allowlist', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('SENDBLUE_DEV_ALLOWLIST', '+61412345678')
      expect(() => assertOutboundAllowed('+61412345678', 'sendblue')).not.toThrow()
    })

    it('normalises phone formatting before matching (spaces/dashes/parens)', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('SENDBLUE_DEV_ALLOWLIST', '+61412345678')
      expect(() => assertOutboundAllowed('+61 412 345 678', 'sendblue')).not.toThrow()
      expect(() => assertOutboundAllowed('+61-412-345-678', 'sms')).not.toThrow()
      expect(() => assertOutboundAllowed('+61 (412) 345-678', 'whatsapp')).not.toThrow()
    })

    it('normalises allowlist entries with whitespace and case', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('SENDBLUE_DEV_ALLOWLIST', ' +61412345678 , Test@Example.COM ')
      expect(() => assertOutboundAllowed('+61412345678', 'sendblue')).not.toThrow()
      expect(() => assertOutboundAllowed('test@example.com', 'telegram')).not.toThrow()
    })

    it('matches telegram chat IDs / Matrix IDs case-insensitively', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('SENDBLUE_DEV_ALLOWLIST', '@tor:matrix.org,123456789')
      expect(() => assertOutboundAllowed('@TOR:matrix.org', 'matrix')).not.toThrow()
      expect(() => assertOutboundAllowed('123456789', 'telegram')).not.toThrow()
    })

    it('throws for recipient not in allowlist even when similar one exists', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('SENDBLUE_DEV_ALLOWLIST', '+61412345678')
      expect(() => assertOutboundAllowed('+61412345679', 'sendblue')).toThrow(OutboundBlockedError)
    })

    it('treats test env like development', () => {
      vi.stubEnv('NODE_ENV', 'test')
      expect(() => assertOutboundAllowed('+61412345678', 'sendblue')).toThrow(OutboundBlockedError)
    })
  })

  describe('dry-run', () => {
    it('throws dry-run regardless of env', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('BITBIT_OUTBOUND_MODE', 'dry-run')
      expect(() => assertOutboundAllowed('+61412345678', 'sendblue')).toThrow(OutboundBlockedError)
      try {
        assertOutboundAllowed('+61412345678', 'sendblue')
      } catch (err) {
        expect((err as OutboundBlockedError).reason).toBe('dry-run')
      }
    })

    it('dry-run takes precedence over allowlist', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('BITBIT_OUTBOUND_MODE', 'dry-run')
      vi.stubEnv('SENDBLUE_DEV_ALLOWLIST', '+61412345678')
      expect(() => assertOutboundAllowed('+61412345678', 'sendblue')).toThrow(OutboundBlockedError)
    })

    it('isDryRun reports mode correctly', () => {
      vi.stubEnv('BITBIT_OUTBOUND_MODE', 'dry-run')
      expect(isDryRun()).toBe(true)
      vi.stubEnv('BITBIT_OUTBOUND_MODE', '')
      expect(isDryRun()).toBe(false)
    })
  })

  describe('OutboundBlockedError', () => {
    it('captures recipient + channel + reason', () => {
      const err = new OutboundBlockedError('+61412345678', 'sendblue', 'not-allowlisted')
      expect(err.recipient).toBe('+61412345678')
      expect(err.channel).toBe('sendblue')
      expect(err.reason).toBe('not-allowlisted')
      expect(err.name).toBe('OutboundBlockedError')
    })
  })
})
