'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseInboxKeyboardOptions {
  enabled: boolean;
  messageCount: number;
  isDrawerOpen: boolean;
  onOpen: (index: number) => void;
  onArchive: (index: number) => void;
  onDone: (index: number) => void;
  onReply: (index: number) => void;
  onForward: (index: number) => void;
  onSnooze: (index: number) => void;
  onStar: (index: number) => void;
  onDelete: (index: number) => void;
  onSpam: (index: number) => void;
  onSelect: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onCategorySwitch: (category: number) => void;
  onSearch: () => void;
  onClose: () => void;
  onGoInbox?: () => void;
}

export interface UseInboxKeyboardReturn {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  showShortcuts: boolean;
  setShowShortcuts: (show: boolean) => void;
}

// ─── Helper: check if target is editable ──────────────────────────────────────

function isEditableTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (el.getAttribute('role') === 'textbox') return true;
  return false;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

const CHORD_TIMEOUT = 500; // ms to wait for second key in chord

export function useInboxKeyboard(options: UseInboxKeyboardOptions): UseInboxKeyboardReturn {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showShortcuts, setShowShortcuts] = useState(false);

  const lastKeyRef = useRef<string | null>(null);
  const lastKeyTimeRef = useRef<number>(0);
  const optionsRef = useRef(options);

  // Keep options ref up to date
  optionsRef.current = options;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!optionsRef.current.enabled || optionsRef.current.isDrawerOpen) return;

    const isEditing = isEditableTarget(e);
    const meta = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;
    const alt = e.altKey;
    const now = Date.now();
    const opts = optionsRef.current;

    // ── Cmd/Ctrl shortcuts (always active, even when editing) ──

    // Cmd+A → Select all
    if (meta && e.key === 'a' && !alt) {
      e.preventDefault();
      opts.onSelectAll();
      return;
    }

    // Cmd+Shift+A → Deselect all
    if (meta && shift && e.key === 'a' && !alt) {
      e.preventDefault();
      opts.onDeselectAll();
      return;
    }

    // ── Non-editing shortcuts (skip if typing) ──
    if (isEditing) {
      // Allow / to open search even while editing (clear the input first)
      if (e.key === '/' && !meta && !alt) {
        e.preventDefault();
        opts.onSearch();
      }
      return;
    }

    // ── Two-key chords ──
    // Check for "g i" chord → go to inbox
    if (e.key === 'g' && !meta && !shift && !alt) {
      // If we just pressed 'g' within the chord window, check for 'i'
      lastKeyRef.current = 'g';
      lastKeyTimeRef.current = now;
      e.preventDefault();
      return;
    }

    if (
      lastKeyRef.current === 'g' &&
      now - lastKeyTimeRef.current < CHORD_TIMEOUT &&
      e.key === 'i' &&
      !meta &&
      !shift &&
      !alt
    ) {
      e.preventDefault();
      lastKeyRef.current = null;
      if (opts.onGoInbox) opts.onGoInbox();
      return;
    }

    // Reset chord if different key pressed
    if (lastKeyRef.current && e.key !== 'g') {
      lastKeyRef.current = null;
    }

    // ── Single key shortcuts ──

    // ? → Show shortcut overlay
    if (e.key === '?' && !meta && !shift && !alt) {
      e.preventDefault();
      setShowShortcuts(prev => !prev);
      return;
    }

    // / → Focus search
    if (e.key === '/' && !meta && !shift && !alt) {
      e.preventDefault();
      opts.onSearch();
      return;
    }

    // Escape → Close drawer or clear selection
    if (e.key === 'Escape') {
      e.preventDefault();
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
      } else {
        opts.onClose();
      }
      return;
    }

    // j / ArrowDown → Next message
    if ((e.key === 'j' || e.key === 'ArrowDown') && !meta && !shift && !alt) {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, opts.messageCount - 1));
      return;
    }

    // k / ArrowUp → Previous message
    if ((e.key === 'k' || e.key === 'ArrowUp') && !meta && !shift && !alt) {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    // Enter / o → Open selected message
    if ((e.key === 'Enter' || e.key === 'o') && !meta && !shift && !alt) {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < opts.messageCount) {
        opts.onOpen(selectedIndex);
      }
      return;
    }

    // e → Archive
    if (e.key === 'e' && !meta && !shift && !alt) {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < opts.messageCount) {
        opts.onArchive(selectedIndex);
      }
      return;
    }

    // d → Done
    if (e.key === 'd' && !meta && !shift && !alt) {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < opts.messageCount) {
        opts.onDone(selectedIndex);
      }
      return;
    }

    // r → Reply
    if (e.key === 'r' && !meta && !shift && !alt) {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < opts.messageCount) {
        opts.onReply(selectedIndex);
      }
      return;
    }

    // f → Forward
    if (e.key === 'f' && !meta && !shift && !alt) {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < opts.messageCount) {
        opts.onForward(selectedIndex);
      }
      return;
    }

    // s → Snooze
    if (e.key === 's' && !meta && !shift && !alt) {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < opts.messageCount) {
        opts.onSnooze(selectedIndex);
      }
      return;
    }

    // * → Star/unstar
    if (e.key === '*' && !meta && !shift && !alt) {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < opts.messageCount) {
        opts.onStar(selectedIndex);
      }
      return;
    }

    // # → Delete
    if (e.key === '#' && !meta && !shift && !alt) {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < opts.messageCount) {
        opts.onDelete(selectedIndex);
      }
      return;
    }

    // Shift+! → Spam (! is Shift+1)
    if (e.key === '!' && !meta && shift && !alt) {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < opts.messageCount) {
        opts.onSpam(selectedIndex);
      }
      return;
    }

    // x → Toggle select current
    if (e.key === 'x' && !meta && !shift && !alt) {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < opts.messageCount) {
        opts.onSelect(selectedIndex);
      }
      return;
    }

    // 1-4 → Switch category
    if (e.key >= '1' && e.key <= '4' && !meta && !shift && !alt) {
      e.preventDefault();
      const category = parseInt(e.key, 10);
      opts.onCategorySwitch(category);
      return;
    }
  }, [selectedIndex, selectedIds, setShowShortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    selectedIndex,
    setSelectedIndex,
    selectedIds,
    setSelectedIds,
    showShortcuts,
    setShowShortcuts,
  };
}
