import { describe, it, expect, vi, afterEach } from 'vitest'
import { composioToolDefinitions, composioToolHandlers } from '../composio-tools'

// Mock the auth module
vi.mock('@/lib/composio/auth', () => ({
  initiateConnectionByAppKey: vi.fn(),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

describe('composio-tools', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  describe('tool definitions', () => {
    it('exports an array of Anthropic.Tool definitions', () => {
      expect(Array.isArray(composioToolDefinitions)).toBe(true)
      expect(composioToolDefinitions.length).toBe(1)
    })

    it('defines composio_connect_app tool', () => {
      const tool = composioToolDefinitions.find(t => t.name === 'composio_connect_app')
      expect(tool).toBeDefined()
      expect(tool!.description).toContain('connect')
      expect(tool!.input_schema).toBeDefined()
      expect(tool!.input_schema.required).toContain('app')
    })

    it('all tools have valid Anthropic tool_use format', () => {
      for (const tool of composioToolDefinitions) {
        expect(tool.name).toBeTruthy()
        expect(tool.description).toBeTruthy()
        expect(tool.input_schema.type).toBe('object')
        expect(tool.input_schema.properties).toBeDefined()
      }
    })
  })

  describe('tool handlers', () => {
    it('exports handlers for all defined tools', () => {
      for (const tool of composioToolDefinitions) {
        expect(composioToolHandlers[tool.name]).toBeDefined()
        expect(typeof composioToolHandlers[tool.name]).toBe('function')
      }
    })

    describe('composio_connect_app', () => {
      it('returns error when Composio is not configured', async () => {
        delete process.env.COMPOSIO_API_KEY
        const mockSupabase = {} as any
        const result = await composioToolHandlers.composio_connect_app(
          { app: 'slack' },
          'org-1',
          mockSupabase,
        )
        expect(result.success).toBe(false)
        expect(result.error).toContain('not configured')
      })

      it('requires app parameter', async () => {
        process.env.COMPOSIO_API_KEY = 'test-key'
        const mockSupabase = {} as any
        const result = await composioToolHandlers.composio_connect_app({}, 'org-1', mockSupabase)
        expect(result.success).toBe(false)
        expect(result.error).toContain('app')
      })

      it('returns connect URL on success', async () => {
        process.env.COMPOSIO_API_KEY = 'test-key'
        const { initiateConnectionByAppKey } = await import('@/lib/composio/auth')
        vi.mocked(initiateConnectionByAppKey).mockResolvedValue({
          redirectUrl: 'https://composio.dev/auth/slack',
        } as any)

        const mockSupabase = {} as any
        const result = await composioToolHandlers.composio_connect_app(
          { app: 'slack', reason: 'User wants Slack' },
          'org-1',
          mockSupabase,
        )
        expect(result.success).toBe(true)
        expect((result.data as any).connect_url).toBe('https://composio.dev/auth/slack')
      })

      it('returns error when redirect URL is missing', async () => {
        process.env.COMPOSIO_API_KEY = 'test-key'
        const { initiateConnectionByAppKey } = await import('@/lib/composio/auth')
        vi.mocked(initiateConnectionByAppKey).mockResolvedValue({} as any)

        const mockSupabase = {} as any
        const result = await composioToolHandlers.composio_connect_app(
          { app: 'unknown_app' },
          'org-1',
          mockSupabase,
        )
        expect(result.success).toBe(false)
        expect(result.error).toContain('unknown_app')
      })

      it('returns error when initiateConnectionByAppKey throws', async () => {
        process.env.COMPOSIO_API_KEY = 'test-key'
        const { initiateConnectionByAppKey } = await import('@/lib/composio/auth')
        vi.mocked(initiateConnectionByAppKey).mockRejectedValue(new Error('Network error'))

        const mockSupabase = {} as any
        const result = await composioToolHandlers.composio_connect_app(
          { app: 'slack' },
          'org-1',
          mockSupabase,
        )
        expect(result.success).toBe(false)
        expect(result.error).toContain('Network error')
      })
    })
  })
})
