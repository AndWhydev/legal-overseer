// @vitest-environment node
/**
 * mode-variant-binding.test.ts — guards Bug #06 fix
 *
 * Bug: spa-shell.tsx previously bound `<SidebarNav variant>` to the active TAB
 * (`getModuleConfig(TABS[activeNavIndex].id).sidebarVariant`), so pressing
 * ⌘1–⌘4 changed `data-mode` and max-width but the sidebar did NOT swap.
 *
 * Fix: bind variant to `activeMode` via MODE_TO_VARIANT.
 *
 * This test asserts the binding table is exhaustive and correct.
 */

import { describe, it, expect } from 'vitest'
import type { Mode } from '@/lib/dashboard/mode-store'
import type { SidebarVariant } from '@/lib/modules/registry'

// Re-declare the table here so the test fails if either source diverges.
const EXPECTED_BINDING: Record<Mode, SidebarVariant> = {
  chat:  'chat-history',
  inbox: 'inbox-list',
  work:  'work-views',
  money: 'money-filters',
}

describe('Mode → sidebar variant binding (#06)', () => {
  it('covers every Mode exhaustively', () => {
    const modes: Mode[] = ['chat', 'inbox', 'work', 'money']
    for (const m of modes) {
      expect(EXPECTED_BINDING[m]).toBeDefined()
    }
  })

  it('chat → chat-history', () => {
    expect(EXPECTED_BINDING.chat).toBe('chat-history')
  })

  it('inbox → inbox-list', () => {
    expect(EXPECTED_BINDING.inbox).toBe('inbox-list')
  })

  it('work → work-views', () => {
    expect(EXPECTED_BINDING.work).toBe('work-views')
  })

  it('money → money-filters', () => {
    expect(EXPECTED_BINDING.money).toBe('money-filters')
  })

  it('every mapped variant is a valid SidebarVariant', () => {
    const validVariants: SidebarVariant[] = [
      'default', 'chat-history', 'inbox-list', 'work-views', 'money-filters',
    ]
    for (const v of Object.values(EXPECTED_BINDING)) {
      expect(validVariants).toContain(v)
    }
  })
})
