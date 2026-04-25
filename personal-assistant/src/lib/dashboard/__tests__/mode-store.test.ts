/**
 * Vitest tests for mode-store reducer / context.
 * RED phase: these tests are written BEFORE the implementation.
 * They should FAIL until mode-store.ts is created.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---- Types mirrored from what mode-store will export ----
// (imported once mode-store.ts exists)
import type { Mode } from '../mode-store';
import {
  createModeStore,
  INITIAL_PER_MODE_STATE,
  modeReducer,
  type ModeAction,
  type ModeState,
} from '../mode-store';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MODES: Mode[] = ['chat', 'inbox', 'work', 'money'];

function buildInitialState(): ModeState {
  return {
    active: 'chat',
    perMode: {
      chat:  { lastTab: 'chat',     scrollY: 0, sidebarSelection: null },
      inbox: { lastTab: 'inbox',    scrollY: 0, sidebarSelection: null },
      work:  { lastTab: 'tasks',    scrollY: 0, sidebarSelection: null },
      money: { lastTab: 'invoices', scrollY: 0, sidebarSelection: null },
    },
  };
}

// ─── localStorage mock ───────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('modeReducer (pure reducer)', () => {
  // ── (a) switchMode updates active ────────────────────────────────────────
  it('(a) switchMode updates active mode', () => {
    const state = buildInitialState();
    const next = modeReducer(state, { type: 'SWITCH_MODE', mode: 'inbox' });
    expect(next.active).toBe('inbox');
  });

  // ── (b) per-mode state is isolated ───────────────────────────────────────
  it('(b) per-mode state is isolated across switches', () => {
    let state = buildInitialState();

    // Set some state in inbox mode
    state = modeReducer(state, { type: 'SWITCH_MODE', mode: 'inbox' });
    state = modeReducer(state, { type: 'SET_LAST_TAB', tabId: 'approvals' });
    state = modeReducer(state, { type: 'SET_SCROLL_Y', scrollY: 250 });
    state = modeReducer(state, { type: 'SET_SIDEBAR_SELECTION', selectionId: 'msg_abc' });

    // Switch to work mode and back to inbox
    state = modeReducer(state, { type: 'SWITCH_MODE', mode: 'work' });
    state = modeReducer(state, { type: 'SWITCH_MODE', mode: 'inbox' });

    // Inbox state should still be preserved
    expect(state.perMode.inbox.lastTab).toBe('approvals');
    expect(state.perMode.inbox.scrollY).toBe(250);
    expect(state.perMode.inbox.sidebarSelection).toBe('msg_abc');
    // Work state should be untouched
    expect(state.perMode.work.scrollY).toBe(0);
  });

  // ── (e) unknown mode coerced to chat ─────────────────────────────────────
  it('(e) unknown mode string is coerced to "chat"', () => {
    const state = buildInitialState();
    const next = modeReducer(state, { type: 'SWITCH_MODE', mode: 'unknown' as Mode });
    expect(next.active).toBe('chat');
  });

  // ── (f) reducer is pure (no side effects) ────────────────────────────────
  it('(f) reducer is pure — original state not mutated', () => {
    const state = buildInitialState();
    const frozen = JSON.stringify(state);
    modeReducer(state, { type: 'SWITCH_MODE', mode: 'money' });
    expect(JSON.stringify(state)).toBe(frozen);
  });
});

describe('createModeStore persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── (c) persistence: store writes to localStorage and fresh store reads back ──
  it('(c) store writes state to localStorage and a fresh store reads it back', async () => {
    const userId = 'user-test-123';
    const store = createModeStore({ userId });

    // Switch mode
    store.dispatch({ type: 'SWITCH_MODE', mode: 'money' });

    // Advance timers past the 500ms debounce
    await vi.advanceTimersByTimeAsync(600);

    // localStorage should have been written
    const raw = localStorageMock.getItem('bitbit-mode-state');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.userId).toBe(userId);
    expect(parsed.active).toBe('money');

    // A fresh store with the same userId should restore from localStorage
    const store2 = createModeStore({ userId });
    expect(store2.getState().active).toBe('money');
  });

  // ── (d) debounce: rapid setScrollY => single localStorage write ──────────
  it('(d) rapid setScrollY calls result in a single localStorage write after 500ms', async () => {
    const userId = 'user-debounce';
    const store = createModeStore({ userId });
    const setItemSpy = vi.spyOn(localStorageMock, 'setItem');

    // Fire many rapid updates
    for (let i = 0; i < 10; i++) {
      store.dispatch({ type: 'SET_SCROLL_Y', scrollY: i * 50 });
    }

    // Before the debounce settles, nothing should be written
    await vi.advanceTimersByTimeAsync(100);
    expect(setItemSpy).not.toHaveBeenCalled();

    // After 500ms quiet period, exactly one write
    await vi.advanceTimersByTimeAsync(500);
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    const raw = localStorageMock.getItem('bitbit-mode-state');
    const parsed = JSON.parse(raw!);
    // Final scroll position should be 9*50 = 450
    expect(parsed.perMode.chat.scrollY).toBe(450);
  });
});
