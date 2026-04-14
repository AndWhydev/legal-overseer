/**
 * Regression test for registry fallbacks.
 *
 * The built-in-providers.ts array no longer includes Composio apps
 * (Slack, Notion, HubSpot, Xero). They are now supposed to be filled in
 * by the composio-manifest-loader at startup. If the loader can't run
 * (no API key, Composio down, local dev), the registry MUST still have
 * entries for them so downstream code like `registry.get('slack')` and
 * catalog rendering don't silently break.
 *
 * This test locks in the static fallback behaviour.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { getProviderRegistry, _resetProviderRegistryForTest } from '../registry'

describe('ProviderRegistry static Composio fallbacks', () => {
  beforeEach(() => {
    _resetProviderRegistryForTest()
    // Ensure the dynamic loader is NOT kicked off.
    delete process.env.COMPOSIO_API_KEY
  })

  it('returns entries for slack/notion/hubspot/xero without COMPOSIO_API_KEY', () => {
    const registry = getProviderRegistry()
    for (const id of ['slack', 'notion', 'hubspot', 'xero']) {
      const m = registry.get(id)
      expect(m, `fallback for ${id} should exist`).toBeDefined()
      expect(m?.lifecycle).toBe('composio')
      expect(m?.source).toBe('builtin')
      expect(m?.composioToolkit).toBe(id)
    }
  })

  it('still includes the native/bespoke providers (gmail, whatsapp)', () => {
    const registry = getProviderRegistry()
    expect(registry.get('gmail')).toBeDefined()
    expect(registry.get('whatsapp')).toBeDefined()
    expect(registry.get('imessage')).toBeDefined()
  })

  it('lists at least gmail + the four composio fallbacks after init', () => {
    const registry = getProviderRegistry()
    const ids = registry.list().map((p) => p.id)
    expect(ids).toEqual(
      expect.arrayContaining(['gmail', 'slack', 'notion', 'hubspot', 'xero']),
    )
  })
})
