/**
 * Parity harness — asserts the UnifiedToolCatalog produces the same
 * dispatch outcome as calling the native handler directly.
 *
 * We don't test the FULL agent loop here (that needs a real Anthropic
 * API key); we test the critical invariant: for every native tool,
 * catalog.dispatch(name, input) returns the same shape as
 * handler(input).
 */
import { describe, it, expect, vi } from 'vitest'
import { createUnifiedCatalog } from '../bridge'

describe('UnifiedToolCatalog parity with legacy handlers', () => {
  it('dispatches to the same handler with the same args', async () => {
    const searchTasks = vi.fn().mockResolvedValue({
      success: true,
      data: [{ id: 't1', title: 'Review PR' }],
    })
    const catalog = createUnifiedCatalog({
      nativeTools: [{
        name: 'search_tasks',
        description: 'Search your task list',
        input_schema: { type: 'object', properties: {} },
      } as any],
      nativeHandlers: { search_tasks: searchTasks },
    })

    const supabase = {} as any
    const result = await catalog.dispatch(
      'search_tasks',
      { query: 'pr' },
      { orgId: 'org-1', supabase },
    )

    expect(searchTasks).toHaveBeenCalledWith({ query: 'pr' }, 'org-1', supabase)
    expect(result).toEqual({ success: true, data: [{ id: 't1', title: 'Review PR' }] })
  })

  it('preserves legacy handler error payloads', async () => {
    const failing = vi.fn().mockResolvedValue({ success: false, error: 'nope' })
    const catalog = createUnifiedCatalog({
      nativeTools: [],
      nativeHandlers: { failing_tool: failing },
    })

    const result = await catalog.dispatch('failing_tool', {}, { orgId: 'x', supabase: {} as any })
    expect(result).toEqual({ success: false, error: 'nope' })
  })

  it('descriptors summary is truncated to ~140 chars', async () => {
    const longDescription = 'a'.repeat(300)
    const catalog = createUnifiedCatalog({
      nativeTools: [{
        name: 'huge_tool',
        description: longDescription,
        input_schema: { type: 'object', properties: {} },
      } as any],
      nativeHandlers: {},
    })

    const descriptors = await catalog.listDescriptors('org-1')
    const huge = descriptors.find((d) => d.name === 'huge_tool')
    expect(huge).toBeDefined()
    expect(huge!.summary.length).toBeLessThanOrEqual(140)
  })
})
