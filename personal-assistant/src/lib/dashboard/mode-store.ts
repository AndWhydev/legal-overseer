/**
 * mode-store.ts — Dashboard mode state management
 *
 * Uses React context + useReducer (no Zustand dependency).
 * Also exposes a createModeStore() factory for use outside React (tests, SSR).
 *
 * Mode is the top-level workspace context: chat | inbox | work | money.
 * Each mode independently tracks: lastTab, scrollY, sidebarSelection.
 *
 * Persistence: debounced 500ms localStorage write under "bitbit-mode-state",
 * scoped by userId.
 */

import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Mode = 'chat' | 'inbox' | 'work' | 'money';

const VALID_MODES: ReadonlySet<string> = new Set(['chat', 'inbox', 'work', 'money']);

export interface PerModeState {
  lastTab: string;
  scrollY: number;
  sidebarSelection: string | null;
}

export interface ModeState {
  active: Mode;
  perMode: Record<Mode, PerModeState>;
}

export type ModeAction =
  | { type: 'SWITCH_MODE'; mode: Mode }
  | { type: 'SET_LAST_TAB'; tabId: string }
  | { type: 'SET_SCROLL_Y'; scrollY: number }
  | { type: 'SET_SIDEBAR_SELECTION'; selectionId: string | null }
  | { type: 'RESTORE'; state: ModeState };

// ─── Initial state ────────────────────────────────────────────────────────────

export const INITIAL_PER_MODE_STATE: PerModeState = {
  lastTab: '',
  scrollY: 0,
  sidebarSelection: null,
};

const DEFAULT_MODE_TABS: Record<Mode, string> = {
  chat: 'chat',
  inbox: 'inbox',
  work: 'tasks',
  money: 'invoices',
};

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

// ─── Pure reducer (exported for testing) ─────────────────────────────────────

export function modeReducer(state: ModeState, action: ModeAction): ModeState {
  switch (action.type) {
    case 'SWITCH_MODE': {
      // Coerce unknown modes to 'chat'
      const mode: Mode = VALID_MODES.has(action.mode) ? action.mode : 'chat';
      if (mode === state.active) return state;
      return { ...state, active: mode };
    }

    case 'SET_LAST_TAB': {
      return {
        ...state,
        perMode: {
          ...state.perMode,
          [state.active]: {
            ...state.perMode[state.active],
            lastTab: action.tabId,
          },
        },
      };
    }

    case 'SET_SCROLL_Y': {
      return {
        ...state,
        perMode: {
          ...state.perMode,
          [state.active]: {
            ...state.perMode[state.active],
            scrollY: action.scrollY,
          },
        },
      };
    }

    case 'SET_SIDEBAR_SELECTION': {
      return {
        ...state,
        perMode: {
          ...state.perMode,
          [state.active]: {
            ...state.perMode[state.active],
            sidebarSelection: action.selectionId,
          },
        },
      };
    }

    case 'RESTORE': {
      return action.state;
    }

    default:
      return state;
  }
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

const STORAGE_KEY = 'bitbit-mode-state';

function readFromStorage(userId: string): ModeState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate minimal shape and userId match
    if (!parsed.active || !parsed.perMode) return null;
    if (!VALID_MODES.has(parsed.active)) return null;
    if (parsed.userId && parsed.userId !== userId) return null;
    return { active: parsed.active, perMode: parsed.perMode } as ModeState;
  } catch {
    return null;
  }
}

function writeToStorage(userId: string, state: ModeState): void {
  try {
    const payload = { userId, active: state.active, perMode: state.perMode };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable (SSR, private browsing quota exceeded)
  }
}

// ─── createModeStore — vanilla factory for tests and SSR ─────────────────────

export interface ModeStore {
  getState: () => ModeState;
  dispatch: (action: ModeAction) => void;
  subscribe: (listener: (state: ModeState) => void) => () => void;
}

export function createModeStore(options: { userId?: string } = {}): ModeStore {
  const { userId } = options;

  // Try to restore from localStorage on construction
  const persisted = userId ? readFromStorage(userId) : null;
  let state: ModeState = persisted ?? buildInitialState();

  const listeners = new Set<(state: ModeState) => void>();

  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function persistDebounced(): void {
    if (!userId) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      writeToStorage(userId, state);
      debounceTimer = null;
    }, 500);
  }

  function dispatch(action: ModeAction): void {
    const next = modeReducer(state, action);
    if (next === state) return;
    state = next;
    persistDebounced();
    listeners.forEach(l => l(state));
  }

  return {
    getState: () => state,
    dispatch,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// ─── React context ────────────────────────────────────────────────────────────

interface ModeContextValue {
  state: ModeState;
  switchMode: (mode: Mode) => void;
  setLastTab: (tabId: string) => void;
  setScrollY: (y: number) => void;
  setSidebarSelection: (id: string | null) => void;
  restoreFromMode: (mode: Mode) => PerModeState;
}

const ModeContext = createContext<ModeContextValue | null>(null);

// ─── ModeProvider component ───────────────────────────────────────────────────

interface ModeProviderProps {
  children: React.ReactNode;
  userId?: string;
  /** Initial state override (for testing or SSR hydration) */
  initialState?: ModeState;
}

export function ModeProvider({ children, userId, initialState }: ModeProviderProps) {
  const [state, dispatch] = useReducer(modeReducer, undefined, () => {
    // Try localStorage first, then fall back to initialState, then default
    if (typeof window !== 'undefined' && userId) {
      const persisted = readFromStorage(userId);
      if (persisted) return persisted;
    }
    return initialState ?? buildInitialState();
  });

  // Debounce ref — persists across renders without causing re-render
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist state to localStorage with 500ms debounce
  useEffect(() => {
    if (!userId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      writeToStorage(userId, state);
      debounceRef.current = null;
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [state, userId]);

  const switchMode = useCallback((mode: Mode) => {
    dispatch({ type: 'SWITCH_MODE', mode });
  }, []);

  const setLastTab = useCallback((tabId: string) => {
    dispatch({ type: 'SET_LAST_TAB', tabId });
  }, []);

  const setScrollY = useCallback((y: number) => {
    dispatch({ type: 'SET_SCROLL_Y', scrollY: y });
  }, []);

  const setSidebarSelection = useCallback((id: string | null) => {
    dispatch({ type: 'SET_SIDEBAR_SELECTION', selectionId: id });
  }, []);

  const restoreFromMode = useCallback((mode: Mode): PerModeState => {
    return state.perMode[mode];
  }, [state]);

  const value: ModeContextValue = {
    state,
    switchMode,
    setLastTab,
    setScrollY,
    setSidebarSelection,
    restoreFromMode,
  };

  return React.createElement(ModeContext.Provider, { value }, children);
}

// ─── useModeStore hook ────────────────────────────────────────────────────────

export function useModeStore(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) {
    throw new Error('useModeStore must be used within a ModeProvider');
  }
  return ctx;
}

/**
 * useModeStoreOptional — null-safe variant of useModeStore.
 *
 * Returns null when called outside a ModeProvider (e.g. when the dashboard
 * modes feature flag is off and ModeProvider is not mounted). Consumers must
 * handle the null case — this is intentional to make the flag-off path safe.
 */
export function useModeStoreOptional(): ModeContextValue | null {
  return useContext(ModeContext);
}

// Re-export DEFAULT_MODE_TABS for consumers that need to know per-mode defaults
export { DEFAULT_MODE_TABS };
