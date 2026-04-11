import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies before importing
vi.mock('@/lib/context/loader', () => ({
  loadContext: vi.fn().mockResolvedValue({
    goals: [], tasks: [], contacts: [], recentActivity: [], columns: [],
  }),
}))
vi.mock('./policy-loader', () => ({
  loadPolicies: vi.fn().mockResolvedValue(''),
}))
vi.mock('./voice-loader', () => ({
  loadVoiceProfile: vi.fn().mockResolvedValue(''),
}))
vi.mock('@/lib/industry/registry', () => ({
  getPack: vi.fn().mockReturnValue({
    persona: { name: 'BitBit', context: 'a small business', systemPromptSuffix: '' },
  }),
  resolveIndustry: vi.fn().mockReturnValue('general'),
}))
vi.mock('@/lib/context/entity-mention-scanner', () => ({
  scanForEntityMentions: vi.fn().mockReturnValue([]),
}))
vi.mock('@/lib/context/baseplate-snapshot', () => ({
  getBaseplateSnapshot: vi.fn().mockResolvedValue(null),
}))
vi.mock('./approval-queue', () => ({
  getPendingApprovals: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Mock fs/path for cache reads
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('[]'),
  existsSync: vi.fn().mockReturnValue(false),
  readdirSync: vi.fn().mockReturnValue([]),
}))

import { buildSystemPrompt, BITBIT_IDENTITY_PREAMBLE } from './prompt-builder'

function createMockSupabase() {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {}
  const chainMethods = ['from', 'select', 'insert', 'eq', 'gte', 'order', 'limit', 'in']
  for (const m of chainMethods) {
    mock[m] = vi.fn().mockImplementation(() => mock)
  }
  mock.single = vi.fn().mockResolvedValue({ data: null, error: null })
  return mock
}

describe('prompt-builder identity preamble', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mockSupabase = createMockSupabase()
    // loadContext returns via supabase mock
  })

  it('exports BITBIT_IDENTITY_PREAMBLE constant', () => {
    expect(BITBIT_IDENTITY_PREAMBLE).toBeDefined()
    expect(typeof BITBIT_IDENTITY_PREAMBLE).toBe('string')
    expect(BITBIT_IDENTITY_PREAMBLE).toContain('You are BitBit')
  })

  it('buildSystemPrompt output starts with identity preamble', async () => {
    const prompt = await buildSystemPrompt(mockSupabase as any, 'org-1')
    expect(prompt.startsWith(BITBIT_IDENTITY_PREAMBLE)).toBe(true)
  })

  it('preamble contains key identity assertions', () => {
    expect(BITBIT_IDENTITY_PREAMBLE).toContain('## Core Identity')
    expect(BITBIT_IDENTITY_PREAMBLE).toContain('You are BitBit')
    expect(BITBIT_IDENTITY_PREAMBLE).toContain("I'm BitBit")
  })

  it('preamble contains agency-first instructions', () => {
    expect(BITBIT_IDENTITY_PREAMBLE).toContain('DO before DESCRIBE')
    expect(BITBIT_IDENTITY_PREAMBLE).toContain('Never Claim Credit')
  })
})
