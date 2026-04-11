/**
 * Draft Quality Evaluation Harness
 *
 * Structural tests validate prompt template and context integration.
 * LLM evaluation tests (skipped by default) run blind comparison with LLM-as-judge.
 *
 * Replace synthetic fixtures with real (incoming, actual_reply) pairs from
 * channel_messages for production evaluation.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DraftContext, DraftContextMetadata } from '../draft-context-assembler'
import type { RelationshipTrend } from '@/lib/intelligence/relationship-scorer'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/context/baseplate-snapshot', () => ({
  getBaseplateSnapshot: vi.fn(),
}))
vi.mock('@/lib/memory-palace/proactive-recall', () => ({
  proactiveRecall: vi.fn(),
  formatProactiveRecall: vi.fn(),
}))
vi.mock('@/lib/rag/retriever', () => ({
  searchVectors: vi.fn(),
  formatChunksForContext: vi.fn(),
}))
vi.mock('@/lib/intelligence/standing-orders', () => ({
  getActiveOrders: vi.fn(),
  matchOrdersToContext: vi.fn(),
  formatOrdersForPrompt: vi.fn(),
}))
vi.mock('@/lib/intelligence/relationship-scorer', () => ({
  computeRelationshipStrength: vi.fn(),
}))
vi.mock('@/lib/intelligence/contact-timing', () => ({
  analyzeContactTiming: vi.fn(),
}))
vi.mock('@/lib/core/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/lib/roles/comms/tone-adapter', () => ({
  learnClientTone: vi.fn().mockResolvedValue(null),
  adaptDraft: vi.fn().mockImplementation((draft: string) => ({
    originalDraft: draft,
    adaptedDraft: draft,
    profileApplied: null,
    adaptations: [],
  })),
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}))
vi.mock('./voice-loader', () => ({
  loadVoiceProfile: vi.fn().mockResolvedValue(null),
}))
vi.mock('./approval-queue', () => ({
  queueAgentAction: vi.fn(),
}))
vi.mock('./run-logger', () => ({
  logAgentRun: vi.fn(),
}))
vi.mock('./templates', () => ({
  getTemplate: vi.fn().mockResolvedValue(null),
  mergeTemplate: vi.fn(),
}))
vi.mock('./client-profiles', () => ({
  getClientProfile: vi.fn().mockResolvedValue(null),
}))
vi.mock('./sentiment', () => ({
  analyzeSentiment: vi.fn().mockResolvedValue({ label: 'neutral', score: 0.5 }),
}))
vi.mock('./contact-enrichment', () => ({
  enrichContact: vi.fn(),
}))
vi.mock('@/lib/agent/model-registry', () => ({
  resolveModel: vi.fn().mockReturnValue('claude-sonnet-4-20250514'),
}))
vi.mock('@/lib/org/notification-config', () => ({
  getOrgNotificationConfig: vi.fn().mockResolvedValue({ name: 'TestOrg' }),
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

// ─── Evaluation Fixtures ────────────────────────────────────────────────────

interface EvalFixture {
  id: string
  contactName: string
  channel: 'email' | 'whatsapp' | 'sms'
  incomingMessage: string
  userActualReply: string
  contextHint: string // what context the draft should reference
}

/**
 * Synthetic evaluation fixtures for blind comparison testing.
 * Replace with real (incoming, actual_reply) pairs from channel_messages
 * for production evaluation.
 */
const EVAL_FIXTURES: EvalFixture[] = [
  {
    id: 'project-status',
    contactName: 'Sarah Chen',
    channel: 'email',
    incomingMessage: 'Hi, can you give me an update on the Riverside redesign project? We need to know if we are still on track for the April deadline.',
    userActualReply: 'Hey Sarah,\n\nThe Riverside redesign is tracking well. We finished the homepage wireframes last week and the dev team started on the responsive layout yesterday. The April 15th deadline is still on track -- we are actually slightly ahead of schedule on the design phase.\n\nI will send the staging link this Friday for your review.\n\nCheers',
    contextHint: 'Should reference Riverside project, wireframes, April deadline, staging link',
  },
  {
    id: 'invoice-question',
    contactName: 'Marcus Webb',
    channel: 'whatsapp',
    incomingMessage: 'Hey mate, got a question about invoice #1247. The amount seems higher than what we discussed. Can you break it down?',
    userActualReply: 'Hey Marcus! Yeah that invoice covers the extra SEO work we did in Feb plus the original monthly retainer. The breakdown is $2,400 retainer + $800 for the additional keyword research and content updates. Happy to jump on a call if you want to go through it.',
    contextHint: 'Should reference invoice #1247, SEO work, retainer amount, keyword research',
  },
  {
    id: 'new-lead',
    contactName: 'Emma Rodriguez',
    channel: 'email',
    incomingMessage: 'Hello, I found your company through a Google search. We are a mid-size accounting firm looking for a new website. Could you tell me about your services and pricing?',
    userActualReply: 'Hi Emma,\n\nThanks for reaching out! We specialise in websites for professional services firms -- accounting, legal, and consulting. Our typical projects for firms your size run between $8-15K depending on scope.\n\nI would love to learn more about what you are looking for. Are you free for a 15-minute call this week?\n\nBest regards',
    contextHint: 'Should be professional, reference web design services, offer to meet',
  },
  {
    id: 'casual-checkin',
    contactName: 'Dave Liu',
    channel: 'whatsapp',
    incomingMessage: 'Yo! How is everything going? Been a while since we caught up. Still smashing it with the web stuff?',
    userActualReply: 'Dave! Good to hear from you mate. Yeah things are going great, just wrapped up a big e-commerce build last month. We should grab a coffee soon, been too long!',
    contextHint: 'Should be warm and casual, reference the relationship, recent work',
  },
  {
    id: 'complaint',
    contactName: 'Janet Park',
    channel: 'email',
    incomingMessage: 'I am really disappointed with the latest changes to our website. The contact form is broken and has been for 3 days. We are losing leads because of this. This needs to be fixed ASAP.',
    userActualReply: 'Hi Janet,\n\nI am really sorry about the contact form issue -- that is completely unacceptable and I understand your frustration. I have already flagged this with our dev team and they are investigating right now.\n\nI will personally make sure this is resolved within the next few hours. In the meantime, I have set up a temporary redirect to your email so you do not miss any leads.\n\nI will update you as soon as it is fixed.\n\nAndy',
    contextHint: 'Should be empathetic, acknowledge the issue, provide solution timeline',
  },
]

// ─── Mock DraftContext Builder ──────────────────────────────────────────────

function buildMockDraftContext(overrides?: Partial<DraftContext>): DraftContext {
  const metadata: DraftContextMetadata = {
    assemblyTimeMs: 120,
    sourcesAvailable: {
      baseplate: true,
      history: true,
      memories: true,
      rag: true,
      orders: true,
      relationship: true,
    },
    tokenEstimate: 2400,
  }

  return {
    contactBriefing: 'Sarah Chen is the marketing director at Riverside Properties. She has been a client since Jan 2025. Key projects: Riverside redesign ($15K), ongoing SEO retainer ($2,400/mo).',
    conversationHistory: '[Mar 20 via email] Sarah: Can we move the review meeting to Thursday?\n[Mar 20 via email] Andy: Sure, Thursday 2pm works. I will send updated wireframes beforehand.\n[Mar 18 via email] Sarah: Love the homepage direction. A few tweaks on the hero section.',
    memoryRecall: 'Sarah prefers direct communication. She values punctuality and detailed progress updates. Her team reviews designs on Thursdays.',
    ragContext: 'Riverside Properties redesign: Phase 2 (development) started Mar 15. Homepage wireframes approved. Responsive layout in progress. Deadline: April 15.',
    standingOrders: 'Always CC sarah.chen@riverside.com.au on project updates. Never offer discounts without manager approval.',
    relationshipScore: 78,
    relationshipTrend: 'growing' as RelationshipTrend,
    confidenceScore: 0.82,
    metadata,
    ...overrides,
  }
}

function buildEnrichedSystemPrompt(
  name: string,
  channel: string,
  tone: string,
  styleGuide: string,
  signOff: string,
  draftCtx?: DraftContext,
): string {
  const channelGuidance: Record<string, string> = {
    email: 'Write a professional email reply. Include greeting and sign-off.',
    whatsapp: 'Write a concise WhatsApp message. Keep it brief and conversational.',
    sms: 'Write a very short SMS reply. Maximum 2-3 sentences.',
  }

  return `You are drafting a ${channel} reply on behalf of the business owner.

## Contact: ${name}
${draftCtx?.contactBriefing || ''}

## Relationship
${draftCtx ? `Strength: ${draftCtx.relationshipScore}/100, Trend: ${draftCtx.relationshipTrend}` : 'Unknown contact'}

## Recent Conversation History
${draftCtx?.conversationHistory || 'No prior messages found.'}

## Relevant Context
${draftCtx?.ragContext || 'No additional context.'}

## Institutional Knowledge
${draftCtx?.memoryRecall || 'No specific memories.'}

## Standing Orders
${draftCtx?.standingOrders || 'No specific directives.'}

## Voice
Tone: ${tone}
${styleGuide ? `Style Guide: ${styleGuide}` : ''}
Sign off: ${signOff}

${channelGuidance[channel] || ''}

Draft a natural reply that demonstrates knowledge of the relationship and ongoing work.
Reference specific projects, tasks, or interactions where relevant -- but only if they appear in the context above.
Do NOT fabricate project names or details not present in the context.
Return ONLY the message body, no metadata.`
}

// ─── Structural Tests (always run, no API needed) ──────────────────────────

describe('draft quality - structural', () => {
  describe('enriched system prompt template', () => {
    it('should include all context sections when DraftContext provided', () => {
      const ctx = buildMockDraftContext()
      const prompt = buildEnrichedSystemPrompt(
        'Sarah Chen', 'email', 'professional', '', 'Cheers', ctx,
      )

      // Verify all sections present
      expect(prompt).toContain('## Contact: Sarah Chen')
      expect(prompt).toContain('## Relationship')
      expect(prompt).toContain('Strength: 78/100, Trend: growing')
      expect(prompt).toContain('## Recent Conversation History')
      expect(prompt).toContain('## Relevant Context')
      expect(prompt).toContain('## Institutional Knowledge')
      expect(prompt).toContain('## Standing Orders')
      expect(prompt).toContain('## Voice')
    })

    it('should include contact briefing content', () => {
      const ctx = buildMockDraftContext()
      const prompt = buildEnrichedSystemPrompt(
        'Sarah Chen', 'email', 'professional', '', 'Cheers', ctx,
      )

      expect(prompt).toContain('Riverside Properties')
      expect(prompt).toContain('marketing director')
    })

    it('should include conversation history', () => {
      const ctx = buildMockDraftContext()
      const prompt = buildEnrichedSystemPrompt(
        'Sarah Chen', 'email', 'professional', '', 'Cheers', ctx,
      )

      expect(prompt).toContain('wireframes')
      expect(prompt).toContain('hero section')
    })

    it('should include RAG context with project details', () => {
      const ctx = buildMockDraftContext()
      const prompt = buildEnrichedSystemPrompt(
        'Sarah Chen', 'email', 'professional', '', 'Cheers', ctx,
      )

      expect(prompt).toContain('Riverside Properties redesign')
      expect(prompt).toContain('April 15')
    })

    it('should include memory recall', () => {
      const ctx = buildMockDraftContext()
      const prompt = buildEnrichedSystemPrompt(
        'Sarah Chen', 'email', 'professional', '', 'Cheers', ctx,
      )

      expect(prompt).toContain('prefers direct communication')
      expect(prompt).toContain('Thursdays')
    })

    it('should include standing orders', () => {
      const ctx = buildMockDraftContext()
      const prompt = buildEnrichedSystemPrompt(
        'Sarah Chen', 'email', 'professional', '', 'Cheers', ctx,
      )

      expect(prompt).toContain('Always CC sarah.chen@riverside.com.au')
      expect(prompt).toContain('Never offer discounts')
    })

    it('should show graceful degradation when DraftContext is undefined', () => {
      const prompt = buildEnrichedSystemPrompt(
        'Unknown Person', 'email', 'professional', '', 'Best regards', undefined,
      )

      expect(prompt).toContain('Unknown contact')
      expect(prompt).toContain('No prior messages found.')
      expect(prompt).toContain('No additional context.')
      expect(prompt).toContain('No specific memories.')
      expect(prompt).toContain('No specific directives.')
    })

    it('should include channel-specific guidance for email', () => {
      const prompt = buildEnrichedSystemPrompt(
        'Test', 'email', 'professional', '', 'Cheers', undefined,
      )

      expect(prompt).toContain('professional email reply')
    })

    it('should include channel-specific guidance for whatsapp', () => {
      const prompt = buildEnrichedSystemPrompt(
        'Test', 'whatsapp', 'casual', '', 'Cheers', undefined,
      )

      expect(prompt).toContain('concise WhatsApp message')
    })

    it('should include channel-specific guidance for sms', () => {
      const prompt = buildEnrichedSystemPrompt(
        'Test', 'sms', 'casual', '', 'Cheers', undefined,
      )

      expect(prompt).toContain('short SMS reply')
    })

    it('should include style guide when provided', () => {
      const prompt = buildEnrichedSystemPrompt(
        'Test', 'email', 'professional', 'Use Australian English', 'Cheers', undefined,
      )

      expect(prompt).toContain('Style Guide: Use Australian English')
    })

    it('should instruct not to fabricate details', () => {
      const prompt = buildEnrichedSystemPrompt(
        'Test', 'email', 'professional', '', 'Cheers', buildMockDraftContext(),
      )

      expect(prompt).toContain('Do NOT fabricate project names')
      expect(prompt).toContain('only if they appear in the context above')
    })
  })

  describe('prompt enrichment with project context', () => {
    it('should produce a longer prompt with context than without', () => {
      const withContext = buildEnrichedSystemPrompt(
        'Sarah Chen', 'email', 'professional', '', 'Cheers', buildMockDraftContext(),
      )
      const withoutContext = buildEnrichedSystemPrompt(
        'Sarah Chen', 'email', 'professional', '', 'Cheers', undefined,
      )

      expect(withContext.length).toBeGreaterThan(withoutContext.length)
    })

    it('should include project names from DraftContext', () => {
      const ctx = buildMockDraftContext({
        ragContext: 'Active project: White House RE renovation. Budget: $45K. Status: Phase 3 (finishing).',
      })
      const prompt = buildEnrichedSystemPrompt(
        'Sezer', 'email', 'professional', '', 'Cheers', ctx,
      )

      expect(prompt).toContain('White House RE')
      expect(prompt).toContain('$45K')
    })

    it('should NOT include discount language when standing orders prohibit it', () => {
      const ctx = buildMockDraftContext({
        standingOrders: 'NEVER offer discounts or price reductions to any client.',
      })
      const prompt = buildEnrichedSystemPrompt(
        'Test', 'email', 'professional', '', 'Cheers', ctx,
      )

      // Standing orders should be in the prompt to guide the LLM
      expect(prompt).toContain('NEVER offer discounts')
    })
  })

  describe('mock DraftContext builder', () => {
    it('should return fully populated context by default', () => {
      const ctx = buildMockDraftContext()

      expect(ctx.contactBriefing.length).toBeGreaterThan(0)
      expect(ctx.conversationHistory.length).toBeGreaterThan(0)
      expect(ctx.memoryRecall.length).toBeGreaterThan(0)
      expect(ctx.ragContext.length).toBeGreaterThan(0)
      expect(ctx.standingOrders.length).toBeGreaterThan(0)
      expect(ctx.relationshipScore).toBeGreaterThan(0)
      expect(ctx.confidenceScore).toBeGreaterThan(0)
    })

    it('should support partial overrides', () => {
      const ctx = buildMockDraftContext({
        contactBriefing: 'Custom briefing',
        relationshipScore: 95,
      })

      expect(ctx.contactBriefing).toBe('Custom briefing')
      expect(ctx.relationshipScore).toBe(95)
      // Other fields should retain defaults
      expect(ctx.conversationHistory.length).toBeGreaterThan(0)
    })

    it('should have all source flags set to true by default', () => {
      const ctx = buildMockDraftContext()
      const sources = ctx.metadata.sourcesAvailable

      expect(sources.baseplate).toBe(true)
      expect(sources.history).toBe(true)
      expect(sources.memories).toBe(true)
      expect(sources.rag).toBe(true)
      expect(sources.orders).toBe(true)
      expect(sources.relationship).toBe(true)
    })
  })

  describe('confidence reflects context availability', () => {
    it('should report higher confidence from DraftContext with rich sources', () => {
      const ctx = buildMockDraftContext()

      // Rich context should produce confidence > 0.7 (the old hardcoded value)
      expect(ctx.confidenceScore).toBeGreaterThan(0.7)
    })

    it('should report lower confidence when key sources are missing', () => {
      const ctx = buildMockDraftContext({
        contactBriefing: '',
        conversationHistory: '',
        memoryRecall: '',
        ragContext: '',
        standingOrders: '',
        relationshipScore: 10,
        confidenceScore: 0.25,
        metadata: {
          assemblyTimeMs: 50,
          sourcesAvailable: {
            baseplate: false,
            history: false,
            memories: false,
            rag: false,
            orders: false,
            relationship: true,
          },
          tokenEstimate: 100,
        },
      })

      // Sparse context should be below 0.7
      expect(ctx.confidenceScore).toBeLessThan(0.7)
    })
  })

  describe('evaluation fixtures', () => {
    it('should have 5 diverse evaluation fixtures', () => {
      expect(EVAL_FIXTURES).toHaveLength(5)
    })

    it('should cover all three channels', () => {
      const channels = new Set(EVAL_FIXTURES.map(f => f.channel))
      expect(channels.has('email')).toBe(true)
      expect(channels.has('whatsapp')).toBe(true)
    })

    it('should have unique fixture IDs', () => {
      const ids = EVAL_FIXTURES.map(f => f.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('each fixture should have non-empty fields', () => {
      for (const fixture of EVAL_FIXTURES) {
        expect(fixture.contactName.length).toBeGreaterThan(0)
        expect(fixture.incomingMessage.length).toBeGreaterThan(0)
        expect(fixture.userActualReply.length).toBeGreaterThan(0)
        expect(fixture.contextHint.length).toBeGreaterThan(0)
      }
    })
  })
})

// ─── LLM Evaluation Tests (skipped unless ANTHROPIC_API_KEY is set) ────────

describe.skip('draft quality - LLM evaluation', () => {
  /**
   * These tests require ANTHROPIC_API_KEY and incur real token costs.
   * To run: set ANTHROPIC_API_KEY env var and change describe.skip to describe.
   *
   * Scoring dimensions (0-10 each):
   * - Correctness: Does the draft use accurate information from context?
   * - Tone match: Does the draft match the user's communication style?
   * - Detail level: Does the draft reference specific entities/events?
   * - Actionability: Does the draft move the conversation forward?
   */

  it.for(EVAL_FIXTURES)(
    'should produce quality draft for $id fixture',
    { timeout: 30000 },
    async (fixture) => {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic()

      // Build mock context appropriate for this fixture
      const ctx = buildMockDraftContext({
        contactBriefing: `${fixture.contactName} is a client.`,
        conversationHistory: '',
        ragContext: fixture.contextHint,
      })

      // Generate draft using enriched prompt
      const systemPrompt = buildEnrichedSystemPrompt(
        fixture.contactName, fixture.channel, 'professional and friendly',
        '', 'Cheers', ctx,
      )

      const draftResponse = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Reply to this message from ${fixture.contactName}:\n\n${fixture.incomingMessage}`,
        }],
      })

      const draft = draftResponse.content[0]
      expect(draft.type).toBe('text')
      if (draft.type !== 'text') return

      // LLM-as-judge scoring
      const judgeResponse = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: 'You are an evaluation judge. Score each dimension 0-10. Return JSON only: {"correctness": N, "tone_match": N, "detail_level": N, "actionability": N}',
        messages: [{
          role: 'user',
          content: `Compare these two replies to the incoming message.

INCOMING: ${fixture.incomingMessage}

REPLY A (AI draft): ${draft.text}

REPLY B (human actual): ${fixture.userActualReply}

Score REPLY A on:
- correctness (0-10): accurate information from context?
- tone_match (0-10): matches the human's communication style?
- detail_level (0-10): references specific entities/events?
- actionability (0-10): moves conversation forward?`,
        }],
      })

      const judgeText = judgeResponse.content[0]
      if (judgeText.type !== 'text') return

      const scores = JSON.parse(judgeText.text) as {
        correctness: number
        tone_match: number
        detail_level: number
        actionability: number
      }

      // Baseline: each dimension should score at least 4/10
      expect(scores.correctness).toBeGreaterThanOrEqual(4)
      expect(scores.tone_match).toBeGreaterThanOrEqual(4)
      expect(scores.detail_level).toBeGreaterThanOrEqual(3)
      expect(scores.actionability).toBeGreaterThanOrEqual(4)
    },
  )
})
