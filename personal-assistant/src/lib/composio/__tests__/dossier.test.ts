/**
 * Connection Dossier Builder — tests.
 *
 * Mocks:
 *   - `getMCPTools` (returns a fixed tool list)
 *   - `ai` module (`generateText` for the use-case synthesis LLM call)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the AI SDK before importing the module under test
vi.mock('ai', () => ({
  generateText: vi.fn(),
  gateway: vi.fn((modelId: string) => modelId),
}))

// Mock mcp-session
vi.mock('../mcp-session', () => ({
  getMCPTools: vi.fn(),
}))

import { generateText } from 'ai'
import { getMCPTools } from '../mcp-session'
import { buildConnectionDossier } from '../dossier'

const mockedGenerateText = vi.mocked(generateText)
const mockedGetMCPTools = vi.mocked(getMCPTools)

function gmailTools() {
  return [
    {
      name: 'GMAIL_SEND_EMAIL',
      description: 'Send an email via Gmail',
      input_schema: {
        type: 'object',
        properties: { to: {}, subject: {}, body: {} },
        required: ['to', 'subject'],
      },
    },
    {
      name: 'GMAIL_LIST_THREADS',
      description: 'List recent Gmail threads',
      input_schema: {
        type: 'object',
        properties: { max_results: {}, query: {} },
      },
    },
    {
      name: 'NOTION_CREATE_PAGE',
      description: 'Create a page in Notion',
      input_schema: {
        type: 'object',
        properties: { parent_id: {}, title: {} },
      },
    },
  ] as any
}

describe('buildConnectionDossier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a dossier with tool summaries, deduped capabilities, and a synthesized narrative', async () => {
    mockedGetMCPTools.mockResolvedValueOnce(gmailTools())
    mockedGenerateText.mockResolvedValueOnce({
      text: 'You can now draft and send Gmail messages and scan recent threads for context.',
    } as any)

    const dossier = await buildConnectionDossier({
      orgId: 'org-1',
      appKey: 'gmail',
      connectedAccountId: 'ca-123',
    })

    expect(dossier.appKey).toBe('gmail')
    expect(dossier.connectedAccountId).toBe('ca-123')
    expect(typeof dossier.connectedAt).toBe('string')

    // Filtered to GMAIL_ tools only
    const toolNames = dossier.tools.map((t) => t.name)
    expect(toolNames).toContain('GMAIL_SEND_EMAIL')
    expect(toolNames).toContain('GMAIL_LIST_THREADS')
    expect(toolNames).not.toContain('NOTION_CREATE_PAGE')

    // Each tool carries top-level input keys only (not the full schema)
    const sendTool = dossier.tools.find((t) => t.name === 'GMAIL_SEND_EMAIL')!
    expect(sendTool.inputKeys).toEqual(expect.arrayContaining(['to', 'subject', 'body']))
    expect(sendTool.description).toBe('Send an email via Gmail')

    // Capabilities deduped
    expect(dossier.capabilities.length).toBe(new Set(dossier.capabilities).size)
    expect(dossier.capabilities).toEqual(expect.arrayContaining(['GMAIL_SEND_EMAIL', 'GMAIL_LIST_THREADS']))

    // suggestedUseCases is a non-empty string
    expect(typeof dossier.suggestedUseCases).toBe('string')
    expect(dossier.suggestedUseCases.length).toBeGreaterThan(0)

    // Only ONE LLM call per dossier
    expect(mockedGenerateText).toHaveBeenCalledTimes(1)
  })

  it('falls back to a deterministic use-case summary when the LLM call fails', async () => {
    mockedGetMCPTools.mockResolvedValueOnce(gmailTools())
    mockedGenerateText.mockRejectedValueOnce(new Error('gateway timeout'))

    const dossier = await buildConnectionDossier({
      orgId: 'org-1',
      appKey: 'gmail',
      connectedAccountId: 'ca-xyz',
    })

    expect(dossier.suggestedUseCases).toContain('gmail')
    expect(dossier.suggestedUseCases.length).toBeGreaterThan(0)
    expect(dossier.tools.length).toBeGreaterThan(0)
  })

  it('returns an empty-but-valid dossier when no tools are discovered', async () => {
    mockedGetMCPTools.mockResolvedValueOnce([])
    // LLM should not even be called for use cases because the fallback path covers empty

    const dossier = await buildConnectionDossier({
      orgId: 'org-1',
      appKey: 'slack',
      connectedAccountId: 'ca-empty',
    })

    expect(dossier.appKey).toBe('slack')
    expect(dossier.tools).toEqual([])
    expect(dossier.capabilities).toEqual([])
    expect(typeof dossier.suggestedUseCases).toBe('string')
    expect(dossier.suggestedUseCases.length).toBeGreaterThan(0)
  })

  it('falls back to full tool list when no tool names match the app prefix', async () => {
    // Unusual tool naming — none prefixed with SLACK_
    mockedGetMCPTools.mockResolvedValueOnce([
      {
        name: 'sendDirectMessage',
        description: 'Slack DM',
        input_schema: { type: 'object', properties: { user: {}, text: {} } },
      },
    ] as any)
    mockedGenerateText.mockResolvedValueOnce({ text: 'You can DM Slack users.' } as any)

    const dossier = await buildConnectionDossier({
      orgId: 'org-1',
      appKey: 'slack',
      connectedAccountId: 'ca-slack',
    })

    expect(dossier.tools).toHaveLength(1)
    expect(dossier.tools[0].name).toBe('sendDirectMessage')
  })
})
