'use client';

import { useEffect, useCallback, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HotkeyActions {
  /** Navigate to a tab by ID */
  navigateToTab: (tabId: string) => void;
  /** Navigate to category by index (1-6) */
  navigateToCategory: (index: number) => void;
  /** Toggle focus mode (hide sidebar) */
  toggleFocusMode: () => void;
  /** Open search (Cmd+K or /) */
  openSearch: () => void;
  /** Toggle shortcuts cheatsheet */
  toggleCheatsheet: () => void;
  /** Go back in tab history */
  goBack: () => void;
  /** Go forward in tab history */
  goForward: () => void;
  /** Close the active overlay/panel (Escape cascade) */
  escapeCascade: () => void;
}

interface UseHotkeysOptions {
  /** Whether hotkeys are enabled (disabled during modals, etc.) */
  enabled?: boolean;
  /** Current active tab ID, used for backtick toggle */
  activeTabId: string;
  /** Callbacks for each hotkey action */
  actions: HotkeyActions;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if the event target is a text input or editable element */
function isEditableTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  // Check for role="textbox" (rich text editors)
  if (el.getAttribute('role') === 'textbox') return true;
  return false;
}

/** Tab history — circular buffer of last N visited tabs */
const TAB_HISTORY_SIZE = 20;

export class TabHistory {
  private stack: string[] = [];
  private cursor = -1;

  push(tabId: string) {
    // Don't duplicate the current position
    if (this.stack[this.cursor] === tabId) return;
    // Truncate forward history when navigating to a new tab
    this.stack = this.stack.slice(0, this.cursor + 1);
    this.stack.push(tabId);
    // Cap size
    if (this.stack.length > TAB_HISTORY_SIZE) {
      this.stack.shift();
    }
    this.cursor = this.stack.length - 1;
  }

  back(): string | null {
    if (this.cursor <= 0) return null;
    this.cursor--;
    return this.stack[this.cursor];
  }

  forward(): string | null {
    if (this.cursor >= this.stack.length - 1) return null;
    this.cursor++;
    return this.stack[this.cursor];
  }

  /** The previous tab (for backtick toggle) */
  previous(): string | null {
    if (this.stack.length < 2) return null;
    // Find the most recent different tab
    for (let i = this.cursor - 1; i >= 0; i--) {
      if (this.stack[i] !== this.stack[this.cursor]) {
        return this.stack[i];
      }
    }
    return null;
  }

  current(): string | null {
    return this.stack[this.cursor] ?? null;
  }
}

// Singleton history shared across hook instances
const tabHistory = new TabHistory();

export function getTabHistory(): TabHistory {
  return tabHistory;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useHotkeys({ enabled = true, activeTabId, actions }: UseHotkeysOptions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Track tab changes in history
  useEffect(() => {
    tabHistory.push(activeTabId);
  }, [activeTabId]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;
    const a = actionsRef.current;
    const meta = e.metaKey || e.ctrlKey;
    const editing = isEditableTarget(e);

    // ── Meta combos (always active, even when editing) ──

    // Cmd+[ → Go back in tab history
    if (meta && e.key === '[') {
      e.preventDefault();
      a.goBack();
      return;
    }

    // Cmd+] → Go forward in tab history
    if (meta && e.key === ']') {
      e.preventDefault();
      a.goForward();
      return;
    }

    // Cmd+\ → Toggle focus mode
    if (meta && e.key === '\\') {
      e.preventDefault();
      a.toggleFocusMode();
      return;
    }

    // ── Non-editing shortcuts (skip when user is typing) ──
    if (editing) return;

    // Number keys 1-6 → Category navigation
    if (!meta && !e.altKey && !e.shiftKey && e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      a.navigateToCategory(parseInt(e.key, 10));
      return;
    }

    // Backtick (`) → Toggle between last two tabs
    if (e.key === '`' && !meta && !e.altKey) {
      e.preventDefault();
      const prev = tabHistory.previous();
      if (prev) a.navigateToTab(prev);
      return;
    }

    // / → Open search (Gmail/Slack pattern)
    if (e.key === '/' && !meta && !e.altKey) {
      e.preventDefault();
      a.openSearch();
      return;
    }

    // ? → Toggle shortcuts cheatsheet
    if (e.key === '?' && !meta && !e.altKey) {
      e.preventDefault();
      a.toggleCheatsheet();
      return;
    }

    // Escape → Cascade close
    // Note: most overlays handle their own Escape. This is the fallback
    // that reaches the sidebar panel and other dashboard-level UI.
    if (e.key === 'Escape') {
      a.escapeCascade();
      return;
    }
  }, [enabled]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
