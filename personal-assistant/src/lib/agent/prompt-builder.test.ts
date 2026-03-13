import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/context/loader', () => ({
  loadContext: vi.fn().mockResolvedValue({
    goals: [],
    tasks: [],
    contacts: [{ name: 'Amit Suthram', slug: 'amit-suthram', type: 'lead' }],
    recentActivity: [],
    columns: [],
  }),
}))

vi.mock('./policy-loader', () => ({
  loadPolicies: vi.fn().mockResolvedValue(''),
}))

vi.mock('./voice-loader', () => ({
  loadVoiceProfile: vi.fn().mockResolvedValue(''),
}))

vi.mock('./approval-queue', () => ({
  getPendingApprovals: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/industry/registry', () => ({
  getPack: vi.fn().mockReturnValue({
    persona: {
      name: 'BitBit',
      context: 'operations',
      systemPromptSuffix: '',
    },
  }),
  resolveIndustry: vi.fn().mockReturnValue('agency'),
}))

import { buildSystemPrompt } from './prompt-builder'

describe('buildSystemPrompt', () => {
  it('labels contacts as a working context instead of the full CRM', async () => {
    const prompt = await buildSystemPrompt({} as never, 'org-1')

    expect(prompt).toContain('### Contact Working Set (1)')
    expect(prompt).toContain('This list may be truncated for token budget')
    expect(prompt).toContain('- Amit Suthram (lead)')
  })
})
