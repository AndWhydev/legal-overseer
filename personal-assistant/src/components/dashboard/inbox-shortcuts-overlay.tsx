'use client';

import React, { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface ShortcutItem {
  keys: string[];
  description: string;
  category: 'Navigation' | 'Actions' | 'Selection' | 'Other';
}

const SHORTCUTS: ShortcutItem[] = [
  // Navigation
  { keys: ['j', '\u2193'], description: 'Next message', category: 'Navigation' },
  { keys: ['k', '\u2191'], description: 'Previous message', category: 'Navigation' },
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" showCloseButton>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {sortedCategories.map((category, catIdx) => (
            <div key={category}>
              {catIdx > 0 && <Separator className="mb-4" />}
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                {category}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {grouped[category].map((shortcut, idx) => (
                  <div
                    key={`${category}-${idx}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <React.Fragment key={keyIdx}>
                          <kbd className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-xs font-mono font-medium text-foreground">
                            {key}
                          </kbd>
                          {keyIdx < shortcut.keys.length - 1 && (
                            <span className="text-xs text-muted-foreground">+</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground flex-1">
                      {shortcut.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
