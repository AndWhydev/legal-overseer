import { describe, it, expect } from 'vitest'
import { sanitizeForClient } from '../sanitize-response'

describe('sanitizeForClient', () => {
  it('strips model key', () => {
    const data = { model: 'claude-sonnet-4-5-20250929', tokens: 500 }
    const result = sanitizeForClient(data)

    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('tokens', 500)
  })

  it('strips tier key', () => {
    const data = { tier: 'sonnet', tokens: 500 }
    const result = sanitizeForClient(data)

    expect(result).not.toHaveProperty('tier')
    expect(result).toHaveProperty('tokens', 500)
  })

  it('strips provider key', () => {
    const data = { provider: 'anthropic', tokens: 500 }
    const result = sanitizeForClient(data)

    expect(result).not.toHaveProperty('provider')
    expect(result).toHaveProperty('tokens', 500)
  })

  it('strips model_id key', () => {
    const data = { model_id: 'claude-haiku-4-5-20251001', tokens: 500 }
    const result = sanitizeForClient(data)

    expect(result).not.toHaveProperty('model_id')
    expect(result).toHaveProperty('tokens', 500)
  })

  it('strips multiple forbidden keys at once', () => {
    const data = {
      model: 'claude-opus-4-20250514',
      tier: 'opus',
      provider: 'anthropic',
      model_id: 'claude-opus-4-20250514',
      tokens: 1200,
      status: 'complete',
    }
    const result = sanitizeForClient(data)

    expect(result).not.toHaveProperty('model')
    expect(result).not.toHaveProperty('tier')
    expect(result).not.toHaveProperty('provider')
    expect(result).not.toHaveProperty('model_id')
    expect(result).toHaveProperty('tokens', 1200)
    expect(result).toHaveProperty('status', 'complete')
  })

  it('preserves all non-forbidden keys', () => {
    const data = { tokens: 500, status: 'ok', cost: 0.05, timestamp: '2026-03-13' }
    const result = sanitizeForClient(data)

    expect(result).toEqual(data)
  })

  it('handles empty objects', () => {
    const result = sanitizeForClient({})
    expect(result).toEqual({})
  })

  it('does not mutate the original object', () => {
    const data = { model: 'test', tokens: 500 }
    sanitizeForClient(data)

    expect(data).toHaveProperty('model', 'test')
  })
})
