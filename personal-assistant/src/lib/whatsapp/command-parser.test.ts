import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock entity resolver
vi.mock('@/lib/context/entity-resolver', () => ({
  resolveEntityRanked: vi.fn().mockResolvedValue([]),
}))

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn()
  function MockAnthropic() {
    return { messages: { create: mockCreate } }
  }
  return {
    default: MockAnthropic,
    __mockCreate: mockCreate,
  }
})

import { parseCommand, type Intent, type ParsedCommand } from './command-parser'
import { resolveEntityRanked } from '@/lib/context/entity-resolver'

const { __mockCreate } = await import('@anthropic-ai/sdk') as any

function mockLLMResponse(parsed: { intent: string; confidence: number; entities: Record<string, unknown> }) {
  __mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(parsed) }],
  })
}

const mockSupabase = {} as any
const ORG_ID = 'org-1'

describe('command-parser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('intent parsing', () => {
    it('parses invoice intent', async () => {
      mockLLMResponse({ intent: 'invoice', confidence: 0.95, entities: { contactNames: ['Sezer'], amounts: [200] } })

      const result = await parseCommand(mockSupabase, ORG_ID, 'invoice sezer for $200')

      expect(result.intent).toBe('invoice')
      expect(result.confidence).toBe(0.95)
      expect(result.entities.contactNames).toEqual(['Sezer'])
      expect(result.entities.amounts).toEqual([200])
    })

    it('parses lead_status intent', async () => {
      mockLLMResponse({ intent: 'lead_status', confidence: 0.88, entities: { contactNames: ['Acme'] } })

      const result = await parseCommand(mockSupabase, ORG_ID, "what's the status of the Acme lead")

      expect(result.intent).toBe('lead_status')
    })

    it('parses task_create intent', async () => {
      mockLLMResponse({
        intent: 'task_create',
        confidence: 0.92,
        entities: { contactNames: ['Sarah'], dates: ['tomorrow'], rawQuery: 'call sarah tomorrow' },
      })

      const result = await parseCommand(mockSupabase, ORG_ID, 'remind me to call sarah tomorrow')

      expect(result.intent).toBe('task_create')
      expect(result.entities.dates).toEqual(['tomorrow'])
    })

    it('parses search intent', async () => {
      mockLLMResponse({ intent: 'search', confidence: 0.85, entities: { contactNames: ['Bob'], rawQuery: 'email from bob' } })

      const result = await parseCommand(mockSupabase, ORG_ID, 'find the email from bob')

      expect(result.intent).toBe('search')
    })

    it('parses approve intent', async () => {
      mockLLMResponse({ intent: 'approve', confidence: 0.99, entities: {} })

      const result = await parseCommand(mockSupabase, ORG_ID, 'yes')

      expect(result.intent).toBe('approve')
    })

    it('parses help intent', async () => {
      mockLLMResponse({ intent: 'help', confidence: 0.95, entities: {} })

      const result = await parseCommand(mockSupabase, ORG_ID, 'help')

      expect(result.intent).toBe('help')
    })
  })

  describe('invalid intent handling', () => {
    it('defaults invalid intent to unknown', async () => {
      mockLLMResponse({ intent: 'delete_everything', confidence: 0.9, entities: {} })

      const result = await parseCommand(mockSupabase, ORG_ID, 'do something weird')

      expect(result.intent).toBe('unknown')
    })

    it('returns unknown on LLM failure', async () => {
      __mockCreate.mockRejectedValue(new Error('API down'))

      const result = await parseCommand(mockSupabase, ORG_ID, 'anything')

      expect(result.intent).toBe('unknown')
      expect(result.confidence).toBe(0)
    })

    it('handles malformed JSON response gracefully', async () => {
      __mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'I cannot parse that' }],
      })

      const result = await parseCommand(mockSupabase, ORG_ID, 'gibberish')

      expect(result.intent).toBe('unknown')
    })
  })

  describe('entity resolution', () => {
    it('resolves contact names via entity resolver', async () => {
      mockLLMResponse({ intent: 'invoice', confidence: 0.9, entities: { contactNames: ['Sezer'] } })
      vi.mocked(resolveEntityRanked).mockResolvedValue([
        {
          contact: { id: 'c1', name: 'Sezer Ozturk', org_id: ORG_ID, slug: 'sezer', type: 'individual', emails: [], phones: [], aliases: [], profile_data: {}, communication_patterns: {} },
          matchConfidence: 1.0,
          matchStep: 'alias',
        },
      ])

      const result = await parseCommand(mockSupabase, ORG_ID, 'invoice sezer for $200')

      expect(resolveEntityRanked).toHaveBeenCalledWith(mockSupabase, 'Sezer', ORG_ID)
      expect(result.resolvedContacts).toHaveLength(1)
      expect(result.resolvedContacts![0].contact.id).toBe('c1')
    })

    it('does not resolve when no contact names found', async () => {
      mockLLMResponse({ intent: 'help', confidence: 0.95, entities: {} })

      const result = await parseCommand(mockSupabase, ORG_ID, 'help')

      expect(resolveEntityRanked).not.toHaveBeenCalled()
      expect(result.resolvedContacts).toBeUndefined()
    })

    it('skips contacts with no matches', async () => {
      mockLLMResponse({ intent: 'invoice', confidence: 0.9, entities: { contactNames: ['Nobody'] } })
      vi.mocked(resolveEntityRanked).mockResolvedValue([])

      const result = await parseCommand(mockSupabase, ORG_ID, 'invoice nobody')

      expect(result.resolvedContacts).toEqual([])
    })
  })

  describe('confidence and entities', () => {
    it('defaults confidence to 0 when missing from response', async () => {
      __mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ intent: 'help', entities: {} }) }],
      })

      const result = await parseCommand(mockSupabase, ORG_ID, 'help')

      // confidence defaults via `parsed.confidence || 0` -- truthy check
      // If LLM omits confidence, it's undefined -> falsy -> 0
      expect(typeof result.confidence).toBe('number')
    })

    it('defaults entities to empty object when missing', async () => {
      __mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ intent: 'help', confidence: 0.9 }) }],
      })

      const result = await parseCommand(mockSupabase, ORG_ID, 'help')

      expect(result.entities).toEqual({})
    })
  })
})
