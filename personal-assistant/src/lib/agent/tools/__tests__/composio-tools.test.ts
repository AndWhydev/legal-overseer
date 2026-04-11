import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { composioToolDefinitions, composioToolHandlers } from '../composio-tools'

describe('composio-tools', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  describe('tool definitions', () => {
    it('exports an array of Anthropic.Tool definitions', () => {
      expect(Array.isArray(composioToolDefinitions)).toBe(true)
      expect(composioToolDefinitions.length).toBe(4)
    })

    it('defines composio_list_apps tool', () => {
      const tool = composioToolDefinitions.find(t => t.name === 'composio_list_apps')
      expect(tool).toBeDefined()
      expect(tool!.description).toContain('connected')
      expect(tool!.input_schema).toBeDefined()
    })

    it('defines composio_list_actions tool', () => {
      const tool = composioToolDefinitions.find(t => t.name === 'composio_list_actions')
      expect(tool).toBeDefined()
      expect(tool!.input_schema.required).toContain('app')
    })

    it('defines composio_execute tool', () => {
      const tool = composioToolDefinitions.find(t => t.name === 'composio_execute')
      expect(tool).toBeDefined()
      expect(tool!.input_schema.required).toContain('action')
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

    describe('composio_list_apps', () => {
      it('returns error when Composio is not configured', async () => {
        delete process.env.COMPOSIO_API_KEY
        const mockSupabase = {} as any
        const result = await composioToolHandlers.composio_list_apps({}, 'org-1', mockSupabase)
        expect(result.success).toBe(false)
        expect(result.error).toContain('not configured')
      })
    })

    describe('composio_list_actions', () => {
      it('requires app parameter', async () => {
        process.env.COMPOSIO_API_KEY = 'test-key'
        const mockSupabase = {} as any
        const result = await composioToolHandlers.composio_list_actions({}, 'org-1', mockSupabase)
        expect(result.success).toBe(false)
        expect(result.error).toContain('app')
      })
    })

    describe('composio_execute', () => {
      it('requires action parameter', async () => {
        process.env.COMPOSIO_API_KEY = 'test-key'
        const mockSupabase = {} as any
        const result = await composioToolHandlers.composio_execute({}, 'org-1', mockSupabase)
        expect(result.success).toBe(false)
        expect(result.error).toContain('action')
      })

      it('returns error when Composio is not configured', async () => {
        delete process.env.COMPOSIO_API_KEY
        const mockSupabase = {} as any
        const result = await composioToolHandlers.composio_execute(
          { action: 'GMAIL_SEND_EMAIL', params: {} },
          'org-1',
          mockSupabase,
        )
        expect(result.success).toBe(false)
        expect(result.error).toContain('not configured')
      })
    })
  })
})
