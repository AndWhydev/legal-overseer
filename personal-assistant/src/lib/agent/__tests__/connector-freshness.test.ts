import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { formatConnectorFreshness } from '../connector-freshness'

describe('formatConnectorFreshness', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-17T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns silent label when last_message_at is null', () => {
    expect(formatConnectorFreshness(null)).toBe('connected, no recent messages')
    expect(formatConnectorFreshness(undefined)).toBe('connected, no recent messages')
  })

  it('returns "just now" for <2 minutes', () => {
    expect(formatConnectorFreshness('2026-04-17T11:59:00Z'))
      .toBe('active — last message just now')
  })

  it('returns minute count for 2-59 minutes', () => {
    expect(formatConnectorFreshness('2026-04-17T11:23:00Z'))
      .toBe('active — last message 37 minutes ago')
  })

  it('returns hour count for 1-23 hours', () => {
    expect(formatConnectorFreshness('2026-04-17T09:00:00Z'))
      .toBe('active — last message 3 hours ago')
    expect(formatConnectorFreshness('2026-04-17T11:00:00Z'))
      .toBe('active — last message 1 hour ago')
  })

  it('returns day count for 1-6 days (still "active")', () => {
    expect(formatConnectorFreshness('2026-04-14T12:00:00Z'))
      .toBe('active — last message 3 days ago')
  })

  it('downgrades to "connected" for 7-29 days', () => {
    expect(formatConnectorFreshness('2026-03-21T12:00:00Z'))
      .toBe('connected, last message 27 days ago')
  })

  it('returns stale label for 30+ days', () => {
    expect(formatConnectorFreshness('2026-01-01T00:00:00Z'))
      .toContain('no messages in')
  })

  it('never says "synced"', () => {
    const samples = [
      formatConnectorFreshness(null),
      formatConnectorFreshness('2026-04-17T11:59:00Z'),
      formatConnectorFreshness('2026-04-14T12:00:00Z'),
      formatConnectorFreshness('2026-03-01T12:00:00Z'),
    ]
    for (const s of samples) {
      expect(s).not.toContain('synced')
      expect(s).not.toContain('sync ')
    }
  })

  it('handles clock skew (future timestamp) gracefully', () => {
    expect(formatConnectorFreshness('2026-04-18T00:00:00Z')).toBe('active')
  })

  it('handles malformed timestamps', () => {
    expect(formatConnectorFreshness('not-a-date')).toBe('connected')
  })
})
