'use client';

import React, { useEffect, useRef } from 'react';
import { SFXmark } from 'sf-symbols-lib';

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutDef {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutDef[];
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? '\u2318' : 'Ctrl';

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Space'], label: 'Go to Dashboard' },
      { keys: ['1', '\u2013', '6'], label: 'Jump to category' },
      { keys: ['`'], label: 'Switch to last tab' },
      { keys: [mod, '['], label: 'Back in tab history' },
      { keys: [mod, ']'], label: 'Forward in tab history' },
      { keys: ['Esc'], label: 'Close panel / Go home' },
    ],
  },
  {
    title: 'Search & Commands',
    shortcuts: [
      { keys: [mod, 'K'], label: 'Command palette' },
      { keys: ['/'], label: 'Quick search' },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { keys: [mod, '\\'], label: 'Toggle focus mode' },
      { keys: ['?'], label: 'Show this help' },
    ],
  },
  {
    title: 'Voice & AI',
    shortcuts: [
      { keys: ['Fn'], label: 'Hold: voice \u2022 Tap: text input' },
    ],
  },
];

export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // Use capture phase so we intercept before other Escape handlers
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="bb-shortcuts-backdrop"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="bb-shortcuts-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bb-shortcuts-header">
          <h2 className="bb-shortcuts-title">Keyboard Shortcuts</h2>
          <button
            className="bb-shortcuts-close"
            onClick={onClose}
            aria-label="Close"
          >
            <SFXmark size={16} />
          </button>
        </div>

        {/* Groups */}
        <div className="bb-shortcuts-body">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="bb-shortcuts-group">
              <h3 className="bb-shortcuts-group-title">{group.title}</h3>
              {group.shortcuts.map((shortcut, i) => (
                <div key={i} className="bb-shortcuts-row">
                  <span className="bb-shortcuts-label">{shortcut.label}</span>
                  <span className="bb-shortcuts-keys">
                    {shortcut.keys.map((k, j) => (
                      <React.Fragment key={j}>
                        {j > 0 && <span className="bb-shortcuts-separator"> </span>}
                        <kbd className="bb-shortcuts-key">{k}</kbd>
                      </React.Fragment>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="bb-shortcuts-footer">
          Press <kbd className="bb-shortcuts-key">?</kbd> or <kbd className="bb-shortcuts-key">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
