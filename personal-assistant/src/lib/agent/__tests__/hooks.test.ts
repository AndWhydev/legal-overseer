import { describe, it, expect, vi } from 'vitest'
import {
  runPreToolUseHooks,
  runPostToolUseHooks,
  runPreResponseHooks,
  createDefaultHooks,
  type PreToolUseInput,
  type PostToolUseInput,
  type PreResponseInput,
  type HookConfig,
} from '../engine/hooks'

const mockConfig = {
  orgId: 'org-1',
  supabase: {} as any,
  skipCostGuard: false,
} as any

describe('Agent Engine Hooks', () => {
  describe('runPreToolUseHooks', () => {
    it('returns empty output when no hooks match', async () => {
      const hooks: HookConfig[] = [
        { matcher: 'nonexistent_tool', hook: async () => ({ deny: 'blocked' }) },
      ]
      const input: PreToolUseInput = {
        toolName: 'search_contacts',
        toolId: 'tool-1',
        input: { query: 'test' },
        config: mockConfig,
        executionTokens: 100,
      }
      const result = await runPreToolUseHooks(hooks, input)
      expect(result).toEqual({})
    })

    it('denies when a hook returns deny', async () => {
      const hooks: HookConfig[] = [
        { hook: async () => ({ deny: 'budget exhausted' }) },
      ]
      const input: PreToolUseInput = {
        toolName: 'generate_ad_scripts',
        toolId: 'tool-1',
        input: {},
        config: mockConfig,
        executionTokens: 100,
      }
      const result = await runPreToolUseHooks(hooks, input)
      expect(result.deny).toBe('budget exhausted')
    })

    it('short-circuits on first deny', async () => {
      const secondHook = vi.fn(async () => ({ deny: 'second' }))
      const hooks: HookConfig[] = [
        { hook: async () => ({ deny: 'first' }) },
        { hook: secondHook },
      ]
      const input: PreToolUseInput = {
        toolName: 'test',
        toolId: 'tool-1',
        input: {},
        config: mockConfig,
        executionTokens: 0,
      }
      const result = await runPreToolUseHooks(hooks, input)
      expect(result.deny).toBe('first')
      expect(secondHook).not.toHaveBeenCalled()
    })

    it('merges modifiedInput from non-denying hooks', async () => {
      const hooks: HookConfig[] = [
        { hook: async () => ({ modifiedInput: { extra: true } }) },
      ]
      const input: PreToolUseInput = {
        toolName: 'test',
        toolId: 'tool-1',
        input: { query: 'original' },
        config: mockConfig,
        executionTokens: 0,
      }
      const result = await runPreToolUseHooks(hooks, input)
      expect(result.modifiedInput).toEqual({ extra: true })
    })

    it('respects matcher pattern', async () => {
      const hooks: HookConfig[] = [
        { matcher: 'generate_ad|audit_visibility', hook: async () => ({ deny: 'blocked' }) },
      ]

      const allowed = await runPreToolUseHooks(hooks, {
        toolName: 'search_contacts', toolId: 'tool-1', input: {},
        config: mockConfig, executionTokens: 0,
      })
      expect(allowed.deny).toBeUndefined()

      const blocked = await runPreToolUseHooks(hooks, {
        toolName: 'generate_ad_scripts', toolId: 'tool-2', input: {},
        config: mockConfig, executionTokens: 0,
      })
      expect(blocked.deny).toBe('blocked')
    })
  })

  describe('runPostToolUseHooks', () => {
    it('merges additional context from multiple hooks', async () => {
      const hooks: HookConfig[] = [
        { hook: async () => ({ additionalContext: 'context A' }) },
        { hook: async () => ({ additionalContext: 'context B' }) },
      ]
      const input: PostToolUseInput = {
        toolName: 'test', toolId: 'tool-1', input: {},
        result: { success: true, data: {} },
        config: mockConfig,
      }
      const result = await runPostToolUseHooks(hooks, input)
      expect(result.additionalContext).toContain('context A')
      expect(result.additionalContext).toContain('context B')
    })

    it('collects events from hooks', async () => {
      const hooks: HookConfig[] = [
        { hook: async () => ({ events: [{ type: 'budget_warning', data: {} }] as any }) },
      ]
      const input: PostToolUseInput = {
        toolName: 'test', toolId: 'tool-1', input: {},
        result: { success: true, data: {} },
        config: mockConfig,
      }
      const result = await runPostToolUseHooks(hooks, input)
      expect(result.events).toHaveLength(1)
      expect(result.events![0].type).toBe('budget_warning')
    })

    it('runs fireAndForget hooks without blocking', async () => {
      const asyncHook = vi.fn(async () => {
        await new Promise(r => setTimeout(r, 100))
        return { additionalContext: 'should not appear' }
      })
      const hooks: HookConfig[] = [
        { hook: asyncHook, fireAndForget: true },
      ]
      const input: PostToolUseInput = {
        toolName: 'test', toolId: 'tool-1', input: {},
        result: { success: true, data: {} },
        config: mockConfig,
      }
      const result = await runPostToolUseHooks(hooks, input)
      expect(result.additionalContext).toBeUndefined()
      expect(asyncHook).toHaveBeenCalled()
    })
  })

  describe('runPreResponseHooks', () => {
    it('pipes text through hooks sequentially', async () => {
      const hooks: HookConfig[] = [
        { hook: async (input: any) => ({ text: input.text.replace('Hello', 'Hey') }) },
        { hook: async (input: any) => ({ text: input.text + ' (processed)' }) },
      ]
      const input: PreResponseInput = { text: 'Hello world', config: mockConfig }
      const result = await runPreResponseHooks(hooks, input)
      expect(result.text).toBe('Hey world (processed)')
    })
  })

  describe('createDefaultHooks', () => {
    it('returns all three hook arrays', () => {
      const hooks = createDefaultHooks()
      expect(hooks.preToolUse.length).toBeGreaterThan(0)
      expect(hooks.postToolUse.length).toBeGreaterThan(0)
      expect(hooks.preResponse.length).toBeGreaterThan(0)
    })

    it('budget guard matches growth tools', () => {
      const hooks = createDefaultHooks()
      const budgetHook = hooks.preToolUse[0]
      expect(budgetHook.matcher).toContain('generate_ad_scripts')
      expect(budgetHook.matcher).toContain('search_tenders')
    })

    it('action reflector is fire-and-forget', () => {
      const hooks = createDefaultHooks()
      const reflector = hooks.postToolUse.find(h => h.fireAndForget)
      expect(reflector).toBeDefined()
    })
  })
})
