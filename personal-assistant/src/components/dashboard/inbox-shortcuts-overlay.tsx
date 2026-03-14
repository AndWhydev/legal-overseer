'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ShortcutItem {
  keys: string[];
  description: string;
  category: 'Navigation' | 'Actions' | 'Selection' | 'Other';
}

const SHORTCUTS: ShortcutItem[] = [
  // Navigation
  { keys: ['j', '↓'], description: 'Next message', category: 'Navigation' },
  { keys: ['k', '↑'], description: 'Previous message', category: 'Navigation' },
  { keys: ['Enter', 'o'], description: 'Open message', category: 'Navigation' },
  { keys: ['g', 'i'], description: 'Go to inbox', category: 'Navigation' },

  // Actions
  { keys: ['e'], description: 'Archive', category: 'Actions' },
  { keys: ['d'], description: 'Mark as done', category: 'Actions' },
  { keys: ['r'], description: 'Reply', category: 'Actions' },
  { keys: ['f'], description: 'Forward', category: 'Actions' },
  { keys: ['s'], description: 'Snooze', category: 'Actions' },
  { keys: ['*'], description: 'Star/unstar', category: 'Actions' },
  { keys: ['#'], description: 'Delete', category: 'Actions' },
  { keys: ['Shift', '!'], description: 'Mark as spam', category: 'Actions' },

  // Selection
  { keys: ['Shift', 'Click'], description: 'Range select', category: 'Selection' },
  { keys: ['Cmd/Ctrl', 'Click'], description: 'Toggle select', category: 'Selection' },
  { keys: ['Cmd', 'a'], description: 'Select all', category: 'Selection' },
  { keys: ['Cmd', 'Shift', 'a'], description: 'Deselect all', category: 'Selection' },

  // Other
  { keys: ['/'], description: 'Search', category: 'Other' },
  { keys: ['?'], description: 'Show shortcuts', category: 'Other' },
  { keys: ['1', '2', '3', '4'], description: 'Switch category', category: 'Other' },
  { keys: ['Esc'], description: 'Close/clear', category: 'Other' },
];

const CATEGORY_ORDER: Record<string, number> = {
  Navigation: 0,
  Actions: 1,
  Selection: 2,
  Other: 3,
};

export interface InboxShortcutsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InboxShortcutsOverlay({ isOpen, onClose }: InboxShortcutsOverlayProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    background: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'fadeIn 0.2s ease',
  };

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    width: '90vw',
    maxWidth: 900,
    maxHeight: '90vh',
    overflowY: 'auto',
    borderRadius: 16,
    background: 'rgba(20, 20, 22, 0.95)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 20px 80px rgba(0, 0, 0, 0.5)',
    padding: '32px',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
    paddingBottom: 16,
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 24,
    fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.95)',
    margin: 0,
  };

  const closeButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 8,
    border: 'none',
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'rgba(255, 255, 255, 0.6)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  };

  const categoryContainerStyle: React.CSSProperties = {
    marginBottom: 40,
  };

  const categoryTitleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'rgba(255, 255, 255, 0.4)',
    marginBottom: 16,
    display: 'block',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 12,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 12px',
    borderRadius: 8,
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    transition: 'all 0.15s ease',
  };

  const keyStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
  };

  const keyPillStyle: React.CSSProperties = {
    padding: '3px 8px',
    borderRadius: 4,
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
    whiteSpace: 'nowrap',
  };

  const descriptionStyle: React.CSSProperties = {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    flex: 1,
  };

  // Group shortcuts by category
  const grouped = SHORTCUTS.reduce(
    (acc, shortcut) => {
      const category = shortcut.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push(shortcut);
      return acc;
    },
    {} as Record<string, ShortcutItem[]>
  );

  // Sort categories
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => CATEGORY_ORDER[a] - CATEGORY_ORDER[b]
  );

  return (
    <>
      <div style={overlayStyle} onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        aria-modal="true"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <h2 style={titleStyle}>Keyboard Shortcuts</h2>
          <button
            style={closeButtonStyle}
            onClick={onClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
            }}
            aria-label="Close shortcuts overlay"
          >
            <X size={18} />
          </button>
        </div>

        {sortedCategories.map((category) => (
          <div key={category} style={categoryContainerStyle}>
            <span style={categoryTitleStyle}>{category}</span>
            <div style={gridStyle}>
              {grouped[category].map((shortcut, idx) => (
                <div key={`${category}-${idx}`} style={rowStyle}>
                  <div style={keyStyle}>
                    {shortcut.keys.map((key, keyIdx) => (
                      <React.Fragment key={keyIdx}>
                        <span style={keyPillStyle}>{key}</span>
                        {keyIdx < shortcut.keys.length - 1 && (
                          <span style={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: 11 }}>
                            +
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  <span style={descriptionStyle}>{shortcut.description}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <style>{`
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}</style>
      </div>
    </>
  );
}
