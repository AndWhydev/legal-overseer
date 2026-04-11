import { describe, it, expect } from 'vitest'
import { selectRelevantSkills } from '../skill-rag'
import type { SkillIndexEntry } from '../types'

// ---------------------------------------------------------------------------
// Fixtures — lightweight skill entries (no filesystem needed)
// ---------------------------------------------------------------------------

function makeSkill(overrides: Partial<SkillIndexEntry> & { id: string }): SkillIndexEntry {
  return {
    name: overrides.id.replace(/-/g, ' '),
    description: '',
    tags: [],
    triggerKeywords: [],
    roleAffinity: [],
    estimatedTokens: 1000,
    promptPath: `/mock/${overrides.id}/prompt.md`,
    ...overrides,
  }
}

const SKILLS: SkillIndexEntry[] = [
  makeSkill({
    id: 'seo-visibility',
    description: 'AI/SEO visibility auditing, schema markup, content optimization',
    tags: ['seo', 'visibility', 'schema', 'rankings'],
    triggerKeywords: ['seo', 'audit', 'visibility', 'rankings', 'search performance'],
    roleAffinity: ['operations', 'research'],
    estimatedTokens: 500,
  }),
  makeSkill({
    id: 'pricing-strategy',
    description: 'SaaS and service pricing optimization with competitive analysis',
    tags: ['pricing', 'monetization', 'competitive'],
    triggerKeywords: ['pricing', 'rates', 'packages', 'monetization strategy'],
    roleAffinity: ['sales', 'research', 'finance'],
    estimatedTokens: 5800,
  }),
  makeSkill({
    id: 'deep-research',
    description: 'Multi-source research with citation tracking and structured reports',
    tags: ['research', 'analysis', 'citations'],
    triggerKeywords: ['deep research', 'comprehensive analysis', 'research report'],
    roleAffinity: ['research', 'operations'],
    estimatedTokens: 1500,
  }),
  makeSkill({
    id: 'ad-scripts',
    description: 'Video ad scripts for social platforms with hook variations',
    tags: ['ads', 'video', 'scripts', 'social'],
    triggerKeywords: ['ad script', 'video ad', 'social media ad', 'hook variations'],
    roleAffinity: ['sales', 'comms'],
    estimatedTokens: 500,
  }),
  makeSkill({
    id: 'email-sequences',
    description: 'Automated email sequence design and copywriting',
    tags: ['email', 'sequences', 'nurture', 'drip'],
    triggerKeywords: ['email sequence', 'drip campaign', 'nurture series', 'follow-up emails'],
    roleAffinity: ['comms', 'sales'],
    estimatedTokens: 2000,
  }),
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Skill RAG', () => {
  describe('selectRelevantSkills', () => {
    it('returns empty array when no skills match', () => {
      const result = selectRelevantSkills('hello how are you', SKILLS)
      expect(result.candidates).toHaveLength(0)
    })

    it('matches skills by trigger keywords', () => {
      const result = selectRelevantSkills('run an seo audit on our website', SKILLS)
      expect(result.candidates.length).toBeGreaterThan(0)
      expect(result.candidates[0].id).toBe('seo-visibility')
    })

    it('matches skills by tag overlap', () => {
      const result = selectRelevantSkills('help me with video ad scripts for instagram', SKILLS)
      const ids = result.candidates.map(c => c.id)
      expect(ids).toContain('ad-scripts')
    })

    it('matches skills by name parts in message', () => {
      const result = selectRelevantSkills('I need deep research on competitor pricing', SKILLS)
      const ids = result.candidates.map(c => c.id)
      expect(ids).toContain('deep-research')
      expect(ids).toContain('pricing-strategy')
    })

    it('scores trigger keyword matches higher than tag matches', () => {
      const result = selectRelevantSkills('deep research on market trends', SKILLS)
      // deep-research has exact trigger keyword "deep research" (+3 each word)
      expect(result.candidates[0].id).toBe('deep-research')
      expect(result.scores['deep-research']).toBeGreaterThan(result.scores['seo-visibility'] || 0)
    })

    it('respects maxCandidates limit', () => {
      const result = selectRelevantSkills(
        'research pricing seo ads email sequences visibility audit',
        SKILLS,
        2,
      )
      expect(result.candidates.length).toBeLessThanOrEqual(2)
    })

    it('respects token budget (8000 default)', () => {
      // pricing-strategy alone is 5800 tokens
      // deep-research is 1500 tokens — combined 7300, fits budget
      // email-sequences is 2000 — would push over 8000
      const result = selectRelevantSkills(
        'comprehensive pricing research with email drip campaign design',
        SKILLS,
      )
      const totalTokens = result.candidates.reduce((sum, c) => sum + c.estimatedTokens, 0)
      expect(totalTokens).toBeLessThanOrEqual(8000)
    })

    it('returns scores for all skills in the index', () => {
      const result = selectRelevantSkills('seo visibility audit', SKILLS)
      expect(Object.keys(result.scores)).toHaveLength(SKILLS.length)
    })

    it('returns empty for empty skill index', () => {
      const result = selectRelevantSkills('do an seo audit', [])
      expect(result.candidates).toHaveLength(0)
      expect(result.scores).toEqual({})
    })

    it('handles bigram matching for multi-word skill names', () => {
      const result = selectRelevantSkills('create email sequences for our leads', SKILLS)
      const ids = result.candidates.map(c => c.id)
      expect(ids).toContain('email-sequences')
    })

    it('filters stop words from scoring', () => {
      // "the", "a", "is" should not contribute to scores
      const result1 = selectRelevantSkills('the seo audit', SKILLS)
      const result2 = selectRelevantSkills('seo audit', SKILLS)
      // Scores should be identical since stop words are filtered
      expect(result1.scores['seo-visibility']).toBe(result2.scores['seo-visibility'])
    })
  })
})
