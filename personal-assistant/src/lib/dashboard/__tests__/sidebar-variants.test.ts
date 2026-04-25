/**
 * TDD RED tests for Phase 02 — Per-mode sidebars
 *
 * Tests:
 * 1. getSidebarVariant(mode, flagOn) → correct SidebarVariant
 * 2. Per-mode scroll persistence hook logic (save/restore)
 * 3. j/k keyboard nav in inbox-list (selection-index reducer)
 */

import { describe, it, expect } from 'vitest';
import { getModuleConfig } from '@/lib/modules/registry';
import type { SidebarVariant } from '@/lib/modules/registry';
import type { Mode } from '@/lib/dashboard/mode-store';

// ─── 1. Sidebar variant selection ────────────────────────────────────────────

/**
 * getSidebarVariant: given a mode and whether the flag is on, returns the
 * correct SidebarVariant string for the sidebar to render.
 *
 * When flag is off → always 'default'
 * When flag is on  → per-mode variant from MODULE_CONFIG
 */
function getSidebarVariant(mode: Mode, flagOn: boolean): SidebarVariant {
  if (!flagOn) return 'default';
  // Map mode to the canonical tab for that mode, then read its sidebarVariant
  const MODE_CANONICAL_TAB: Record<Mode, string> = {
    chat: 'chat',
    inbox: 'inbox',
    work: 'tasks',
    money: 'invoices',
  };
  return getModuleConfig(MODE_CANONICAL_TAB[mode]).sidebarVariant;
}

describe('getSidebarVariant', () => {
  it('returns default when flag is off regardless of mode', () => {
    expect(getSidebarVariant('chat', false)).toBe('default');
    expect(getSidebarVariant('inbox', false)).toBe('default');
    expect(getSidebarVariant('work', false)).toBe('default');
    expect(getSidebarVariant('money', false)).toBe('default');
  });

  it('returns chat-history variant for chat mode when flag on', () => {
    expect(getSidebarVariant('chat', true)).toBe('chat-history');
  });

  it('returns inbox-list variant for inbox mode when flag on', () => {
    expect(getSidebarVariant('inbox', true)).toBe('inbox-list');
  });

  it('returns work-views variant for work mode when flag on', () => {
    expect(getSidebarVariant('work', true)).toBe('work-views');
  });

  it('returns money-filters variant for money mode when flag on', () => {
    expect(getSidebarVariant('money', true)).toBe('money-filters');
  });
});

// ─── 2. Per-mode scroll persistence ──────────────────────────────────────────

/**
 * useModeScroll hook logic (pure reducer-style for testing).
 * saveScrollY: saves current scrollY for the given mode
 * restoreScrollY: returns stored scrollY for the given mode
 */

type ScrollState = Record<Mode, number>;

function saveScrollY(state: ScrollState, mode: Mode, y: number): ScrollState {
  if (state[mode] === y) return state;
  return { ...state, [mode]: y };
}

function restoreScrollY(state: ScrollState, mode: Mode): number {
  return state[mode] ?? 0;
}

const INITIAL_SCROLL_STATE: ScrollState = { chat: 0, inbox: 0, work: 0, money: 0 };

describe('per-mode scroll persistence', () => {
  it('saves scrollY for a specific mode without affecting others', () => {
    const state = saveScrollY(INITIAL_SCROLL_STATE, 'inbox', 420);
    expect(state.inbox).toBe(420);
    expect(state.chat).toBe(0);
    expect(state.work).toBe(0);
    expect(state.money).toBe(0);
  });

  it('restores scrollY from saved state for the correct mode', () => {
    const state = saveScrollY(INITIAL_SCROLL_STATE, 'work', 180);
    expect(restoreScrollY(state, 'work')).toBe(180);
    expect(restoreScrollY(state, 'chat')).toBe(0);
  });

  it('returns 0 for modes with no saved scroll', () => {
    expect(restoreScrollY(INITIAL_SCROLL_STATE, 'money')).toBe(0);
  });

  it('overwrites previous scrollY for same mode', () => {
    let state = saveScrollY(INITIAL_SCROLL_STATE, 'inbox', 100);
    state = saveScrollY(state, 'inbox', 500);
    expect(state.inbox).toBe(500);
  });
});

// ─── 3. j/k keyboard nav reducer ─────────────────────────────────────────────

/**
 * Selection-index reducer for keyboard navigation in inbox-list.
 * j → next item (clamp at last)
 * k → prev item (clamp at 0)
 * Any other key → no-op
 */

interface SelectionState {
  index: number;
  total: number;
}

function selectionReducer(
  state: SelectionState,
  action: { key: 'j' | 'k' | 'other' },
): SelectionState {
  switch (action.key) {
    case 'j':
      return { ...state, index: Math.min(state.index + 1, state.total - 1) };
    case 'k':
      return { ...state, index: Math.max(state.index - 1, 0) };
    default:
      return state;
  }
}

describe('inbox-list j/k keyboard nav reducer', () => {
  const base: SelectionState = { index: 0, total: 5 };

  it('j moves to next item', () => {
    const next = selectionReducer(base, { key: 'j' });
    expect(next.index).toBe(1);
  });

  it('k moves to previous item', () => {
    const mid: SelectionState = { index: 2, total: 5 };
    const next = selectionReducer(mid, { key: 'k' });
    expect(next.index).toBe(1);
  });

  it('j clamps at last item', () => {
    const last: SelectionState = { index: 4, total: 5 };
    const next = selectionReducer(last, { key: 'j' });
    expect(next.index).toBe(4);
  });

  it('k clamps at first item', () => {
    const next = selectionReducer(base, { key: 'k' });
    expect(next.index).toBe(0);
  });

  it('unrecognised key is a no-op', () => {
    const next = selectionReducer(base, { key: 'other' });
    expect(next).toBe(base);
  });

  it('chaining j/k navigates correctly across multiple items', () => {
    let state = base;
    state = selectionReducer(state, { key: 'j' }); // 1
    state = selectionReducer(state, { key: 'j' }); // 2
    state = selectionReducer(state, { key: 'k' }); // 1
    expect(state.index).toBe(1);
  });
});
