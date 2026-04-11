import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ComposioMCPClient, mcpToolsToAnthropicTools, transformMCPResult } from '../mcp-client'
import type { MCPToolLike, MCPCallToolResultLike } from '../mcp-types'

describe('composio/mcp-client', () => {
  describe('mcpToolsToAnthropicTools', () => {
    it('converts MCP tools to Anthropic.Tool format', () => {
      const mcpTools: MCPToolLike[] = [
        {
          name: 'GMAIL_SEND_EMAIL',
          description: 'Send an email via Gmail',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              subject: { type: 'string' },
              body: { type: 'string' },
            },
            required: ['to', 'subject', 'body'],
          },
        },
      ]

      const result = mcpToolsToAnthropicTools(mcpTools)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('GMAIL_SEND_EMAIL')
      expect(result[0].description).toBe('Send an email via Gmail')
      expect(result[0].input_schema.type).toBe('object')
      expect(result[0].input_schema.properties).toHaveProperty('to')
      expect(result[0].input_schema.required).toEqual(['to', 'subject', 'body'])
    })

    it('handles tools with no description', () => {
      const mcpTools: MCPToolLike[] = [
        {
          name: 'SLACK_LIST_CHANNELS',
          inputSchema: { type: 'object', properties: {} },
        },
      ]

      const result = mcpToolsToAnthropicTools(mcpTools)
      expect(result[0].description).toBe('')
    })

    it('handles empty tool list', () => {
      expect(mcpToolsToAnthropicTools([])).toEqual([])
    })

    it('caps tool count at maxTools parameter', () => {
      const mcpTools: MCPToolLike[] = Array.from({ length: 100 }, (_, i) => ({
        name: `TOOL_${i}`,
        inputSchema: { type: 'object' as const, properties: {} },
      }))

      const result = mcpToolsToAnthropicTools(mcpTools, 10)
      expect(result).toHaveLength(10)
    })
  })

  describe('transformMCPResult', () => {
    it('transforms text content to ToolResult', () => {
      const mcpResult: MCPCallToolResultLike = {
        content: [{ type: 'text', text: 'Email sent successfully' }],
      }

      const result = transformMCPResult(mcpResult)
      expect(result.success).toBe(true)
      expect(result.data).toBe('Email sent successfully')
    })

    it('transforms error result', () => {
      const mcpResult: MCPCallToolResultLike = {
        content: [{ type: 'text', text: 'Auth failed' }],
        isError: true,
      }

      const result = transformMCPResult(mcpResult)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Auth failed')
    })

    it('handles multi-text content by joining', () => {
      const mcpResult: MCPCallToolResultLike = {
        content: [
          { type: 'text', text: 'Line 1' },
          { type: 'text', text: 'Line 2' },
        ],
      }

      const result = transformMCPResult(mcpResult)
      expect(result.success).toBe(true)
      expect(result.data).toBe('Line 1\nLine 2')
    })

    it('uses structuredContent when available', () => {
      const mcpResult: MCPCallToolResultLike = {
        content: [],
        structuredContent: { emails: [{ id: '1', subject: 'Test' }] },
      }

      const result = transformMCPResult(mcpResult)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ emails: [{ id: '1', subject: 'Test' }] })
    })

    it('handles empty content', () => {
      const mcpResult: MCPCallToolResultLike = { content: [] }
      const result = transformMCPResult(mcpResult)
      expect(result.success).toBe(true)
      expect(result.data).toBe('')
    })
  })

  describe('ComposioMCPClient', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    it('constructs with URL and headers', () => {
      const client = new ComposioMCPClient(
        'https://backend.composio.dev/v3/mcp/srv_123?user_id=org_1',
        { 'x-api-key': 'test-key' },
      )
      expect(client).toBeDefined()
    })

    it('listTools calls MCP endpoint', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          tools: [
            { name: 'GMAIL_SEND_EMAIL', inputSchema: { type: 'object', properties: {} } },
          ],
        }),
      }) as unknown as typeof fetch

      const client = new ComposioMCPClient(
        'https://backend.composio.dev/v3/mcp/srv_123?user_id=org_1',
        { 'x-api-key': 'test-key' },
      )

      const tools = await client.listTools()
      expect(tools).toHaveLength(1)
      expect(tools[0].name).toBe('GMAIL_SEND_EMAIL')
    })

    it('callTool sends correct request', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'Done' }],
        }),
      }) as unknown as typeof fetch

      const client = new ComposioMCPClient(
        'https://backend.composio.dev/v3/mcp/srv_123?user_id=org_1',
        { 'x-api-key': 'test-key' },
      )

      const result = await client.callTool({
        name: 'GMAIL_SEND_EMAIL',
        arguments: { to: 'test@test.com', subject: 'Hi', body: 'Hello' },
      })

      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toEqual({ type: 'text', text: 'Done' })
    })

    it('handles network errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch

      const client = new ComposioMCPClient(
        'https://backend.composio.dev/v3/mcp/srv_123?user_id=org_1',
        { 'x-api-key': 'test-key' },
      )

      const tools = await client.listTools()
      expect(tools).toEqual([])
    })
  })
})
