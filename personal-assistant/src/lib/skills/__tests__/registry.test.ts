import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeSkillRegistry, getAllSkills, getSkillsForRole, resolveSkill } from '../registry'
import type { SkillIndexEntry } from '../types'

// Mock fs and path for controlled test fixtures
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}))

vi.mock('path', async () => {
  const actual = await vi.importActual('path')
  return { ...actual }
})

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const fs = await import('fs')
const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockReaddirSync = vi.mocked(fs.readdirSync)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SKILL_SEO = {
  name: 'SEO Visibility',
  description: 'AI/SEO visibility auditing, schema markup, content optimization',
  tags: ['seo', 'visibility', 'schema'],
  triggerKeywords: ['seo', 'audit', 'visibility', 'rankings'],
  roleAffinity: ['operations', 'research'],
  estimatedTokens: 500,
  planGate: 'growth',
  toolGroup: 'seo',
}

const SKILL_PRICING = {
  name: 'Pricing Strategy',
  description: 'SaaS and service pricing optimization',
  tags: ['pricing', 'monetization'],
  triggerKeywords: ['pricing', 'rates', 'packages', 'monetization'],
  roleAffinity: ['sales', 'research', 'finance'],
  estimatedTokens: 5800,
  planGate: 'growth',
}

const SKILL_RESEARCH = {
  name: 'Deep Research',
  description: 'Multi-source research with citation tracking',
  tags: ['research', 'analysis'],
  triggerKeywords: ['deep research', 'comprehensive analysis', 'research report'],
  roleAffinity: ['research', 'operations'],
  estimatedTokens: 1500,
  planGate: 'growth',
}

function setupMockSkillsDir(skills: Record<string, object>) {
  const entries = Object.keys(skills).map(name => ({
    name,
    isDirectory: () => true,
    isFile: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: '',
    parentPath: '',
  }))

  mockReaddirSync.mockReturnValue(entries as any)

  mockExistsSync.mockImplementation((p: any) => {
    const path = String(p)
    // Skills base dir exists
    if (path.endsWith('src/skills')) return true
    // Each skill dir's skill.json exists
    for (const name of Object.keys(skills)) {
      if (path.includes(`/${name}/skill.json`)) return true
      if (path.includes(`/${name}/prompt.md`)) return true
    }
    // tools.ts doesn't exist
    if (path.endsWith('tools.ts')) return false
    return false
  })

  mockReadFileSync.mockImplementation((p: any) => {
    const path = String(p)
    for (const [name, json] of Object.entries(skills)) {
      if (path.includes(`/${name}/skill.json`)) return JSON.stringify(json)
      if (path.includes(`/${name}/prompt.md`)) return `# ${name}\n\nPrompt content for ${name} skill.`
    }
    throw new Error(`File not found: ${path}`)
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Skill Registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initializeSkillRegistry', () => {
    it('discovers skills from filesystem and builds index', async () => {
      setupMockSkillsDir({
        'seo-visibility': SKILL_SEO,
        'pricing-strategy': SKILL_PRICING,
        'deep-research': SKILL_RESEARCH,
      })

      await initializeSkillRegistry('/mock/src/skills')
      const skills = getAllSkills()

      expect(skills).toHaveLength(3)
      expect(skills.map(s => s.id)).toEqual(
        expect.arrayContaining(['seo-visibility', 'pricing-strategy', 'deep-research'])
      )
    })

    it('parses skill.json fields correctly', async () => {
      setupMockSkillsDir({ 'seo-visibility': SKILL_SEO })
      await initializeSkillRegistry('/mock/src/skills')

      const skills = getAllSkills()
      const seo = skills.find(s => s.id === 'seo-visibility')!

      expect(seo.name).toBe('SEO Visibility')
      expect(seo.description).toBe('AI/SEO visibility auditing, schema markup, content optimization')
      expect(seo.tags).toEqual(['seo', 'visibility', 'schema'])
      expect(seo.triggerKeywords).toEqual(['seo', 'audit', 'visibility', 'rankings'])
      expect(seo.roleAffinity).toEqual(['operations', 'research'])
      expect(seo.estimatedTokens).toBe(500)
      expect(seo.planGate).toBe('growth')
      expect(seo.toolGroup).toBe('seo')
    })

    it('skips directories without skill.json', async () => {
      const entries = [
        { name: 'valid-skill', isDirectory: () => true },
        { name: 'no-json-skill', isDirectory: () => true },
      ]
      mockReaddirSync.mockReturnValue(entries as any)

      mockExistsSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.endsWith('src/skills')) return true
        if (path.includes('/valid-skill/skill.json')) return true
        if (path.includes('/valid-skill/prompt.md')) return true
        return false
      })
      mockReadFileSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.includes('/valid-skill/skill.json')) return JSON.stringify(SKILL_SEO)
        if (path.includes('/valid-skill/prompt.md')) return '# Valid'
        throw new Error(`Not found: ${path}`)
      })

      await initializeSkillRegistry('/mock/src/skills')
      expect(getAllSkills()).toHaveLength(1)
    })

    it('handles non-existent skills directory gracefully', async () => {
      mockExistsSync.mockReturnValue(false)
      await initializeSkillRegistry('/nonexistent/path')
      expect(getAllSkills()).toHaveLength(0)
    })

    it('skips skills missing prompt.md', async () => {
      const entries = [
        { name: 'no-prompt', isDirectory: () => true },
      ]
      mockReaddirSync.mockReturnValue(entries as any)
      mockExistsSync.mockImplementation((p: any) => {
        const path = String(p)
        if (path.endsWith('src/skills')) return true
        if (path.includes('/no-prompt/skill.json')) return true
        if (path.includes('/no-prompt/prompt.md')) return false
        return false
      })
      mockReadFileSync.mockImplementation((p: any) => {
        if (String(p).includes('skill.json')) return JSON.stringify(SKILL_SEO)
        throw new Error('Not found')
      })

      await initializeSkillRegistry('/mock/src/skills')
      expect(getAllSkills()).toHaveLength(0)
    })
  })

  describe('getSkillsForRole', () => {
    beforeEach(async () => {
      setupMockSkillsDir({
        'seo-visibility': SKILL_SEO,
        'pricing-strategy': SKILL_PRICING,
        'deep-research': SKILL_RESEARCH,
      })
      await initializeSkillRegistry('/mock/src/skills')
    })

    it('filters skills by role affinity', () => {
      const financeSkills = getSkillsForRole('finance')
      expect(financeSkills).toHaveLength(1)
      expect(financeSkills[0].id).toBe('pricing-strategy')
    })

    it('returns multiple skills for roles with broad coverage', () => {
      const researchSkills = getSkillsForRole('research')
      expect(researchSkills).toHaveLength(3)
    })

    it('returns empty array for roles with no skills', () => {
      const coordinatorSkills = getSkillsForRole('coordinator')
      expect(coordinatorSkills).toHaveLength(0)
    })

    it('returns operations skills correctly', () => {
      const opsSkills = getSkillsForRole('operations')
      expect(opsSkills.map(s => s.id)).toEqual(
        expect.arrayContaining(['seo-visibility', 'deep-research'])
      )
      expect(opsSkills.map(s => s.id)).not.toContain('pricing-strategy')
    })
  })

  describe('resolveSkill', () => {
    beforeEach(async () => {
      setupMockSkillsDir({ 'deep-research': SKILL_RESEARCH })
      await initializeSkillRegistry('/mock/src/skills')
    })

    it('loads prompt.md content for a valid skill', async () => {
      const resolved = await resolveSkill('deep-research')
      expect(resolved).not.toBeNull()
      expect(resolved!.entry.id).toBe('deep-research')
      expect(resolved!.prompt).toContain('deep-research')
    })

    it('returns null for unknown skill ID', async () => {
      const resolved = await resolveSkill('nonexistent-skill')
      expect(resolved).toBeNull()
    })

    it('caches resolved skills on second call', async () => {
      await resolveSkill('deep-research')
      // readFileSync should have been called for prompt.md
      const callCount = mockReadFileSync.mock.calls.filter(
        c => String(c[0]).includes('prompt.md')
      ).length

      await resolveSkill('deep-research')
      const callCountAfter = mockReadFileSync.mock.calls.filter(
        c => String(c[0]).includes('prompt.md')
      ).length

      // Should not read again — served from cache
      expect(callCountAfter).toBe(callCount)
    })
  })
})
