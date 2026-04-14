import { describe, it, expect } from 'vitest'
import { ProviderRegistry } from '../registry'
import type { ProviderPlugin } from '../types'

const mockProvider: ProviderPlugin = {
  id: 'test-provider',
  name: 'Test Provider',
  description: 'A test provider',
  category: 'custom',
  auth: { method: 'bridge' },
  defaultTransport: 'bridge',
  capabilities: ['push'],
}

describe('ProviderRegistry', () => {
  it('registers and retrieves a provider', () => {
    const registry = new ProviderRegistry()
    registry.register(mockProvider)
    const retrieved = registry.get('test-provider')
    expect(retrieved).toMatchObject(mockProvider)
    expect(retrieved?.lifecycle).toBe('bridge')
    expect(retrieved?.source).toBe('builtin')
  })

  it('returns undefined for unknown provider', () => {
    const registry = new ProviderRegistry()
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('lists all registered providers', () => {
    const registry = new ProviderRegistry()
    registry.register(mockProvider)
    const all = registry.list()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('test-provider')
  })

  it('lists providers by category', () => {
    const registry = new ProviderRegistry()
    registry.register(mockProvider)
    registry.register({ ...mockProvider, id: 'other', category: 'communication' })
    expect(registry.listByCategory('custom')).toHaveLength(1)
    expect(registry.listByCategory('communication')).toHaveLength(1)
  })

  it('prevents duplicate registration', () => {
    const registry = new ProviderRegistry()
    registry.register(mockProvider)
    expect(() => registry.register(mockProvider)).toThrow('already registered')
  })
})
