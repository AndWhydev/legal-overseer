import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectorManifest } from '../manifest'

const getProviderRegistry = vi.fn()

vi.mock('../../connections/registry', () => ({
  getProviderRegistry,
}))

describe('loadComposioManifests', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.COMPOSIO_API_KEY = 'test-key'
    const mod = await import('../composio-manifest-loader')
    mod._resetComposioManifestLoaderForTest()
  })

  it('skips toolkits that collide with non-composio manifests', async () => {
    const manifests = new Map<string, ConnectorManifest>([
      ['gmail', {
        id: 'gmail',
        name: 'Gmail',
        description: 'Native Gmail',
        category: 'communication',
        auth: { method: 'oauth' },
        defaultTransport: 'poll',
        capabilities: ['pull', 'send'],
        lifecycle: 'poll',
        source: 'builtin',
      }],
    ])

    const registry = {
      get: vi.fn((id: string) => manifests.get(id)),
      registerManifest: vi.fn((manifest: ConnectorManifest) => manifests.set(manifest.id, manifest)),
      unregister: vi.fn((id: string) => manifests.delete(id)),
    }
    getProviderRegistry.mockReturnValue(registry)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { slug: 'gmail', name: 'Gmail' },
          { slug: 'slack', name: 'Slack' },
        ],
      }),
    }))

    const { loadComposioManifests } = await import('../composio-manifest-loader')
    const result = await loadComposioManifests({ force: true })

    expect(result.loaded).toBe(1)
    expect(registry.registerManifest).toHaveBeenCalledTimes(1)
    expect(registry.registerManifest).toHaveBeenCalledWith(expect.objectContaining({ id: 'slack' }))
    expect(manifests.get('gmail')?.defaultTransport).toBe('poll')
  })
})
