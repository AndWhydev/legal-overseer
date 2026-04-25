'use client';

/**
 * ModeActionCard — a clickable agent response card that teleports the user
 * to a target mode and optionally navigates to a specific page/tab.
 *
 * The agent can include these cards in responses when a result is best
 * viewed in a different workspace mode. For example:
 *   - "You have 3 overdue invoices" → card with targetMode: 'money'
 *   - "Found 7 unread messages" → card with targetMode: 'inbox'
 *
 * On click:
 *   1. switchMode(targetMode)             — switches active mode
 *   2. bb-navigate event (targetPageId)   — navigates to tab if provided
 *   3. setSidebarSelection(selectionId)   — sets sidebar selection if provided
 *
 * Animation: uses the existing 300ms max-width CSS transition from Phase 01/02.
 * prefers-reduced-motion: snaps instantly (handled by CSS var --mode-transition).
 *
 * HIDE THE MACHINERY: This card never displays "mode: inbox" or persona names.
 * It shows only the card label/description the agent provides.
 */

import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { Mode } from '@/lib/dashboard/mode-store';
import { useModeStoreOptional } from '@/lib/dashboard/mode-store';
import { isDashboardModesEnabled } from '@/lib/dashboard/feature-flag';

const MODES_ENABLED = isDashboardModesEnabled();

// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * ModeActionCardData — the data shape the agent includes in a response card.
 * Extend this as needed; keep it JSON-serializable for storage/streaming.
 */
export interface ModeActionCardData {
  /** Card headline text shown to the user. */
  label: string;
  /** Optional supporting text shown below the label. */
  description?: string;
  /**
   * Target mode to switch to when the card is clicked.
   * When undefined, the card renders but clicking has no mode-switch effect.
   */
  targetMode?: Mode;
  /**
   * Tab/page ID to navigate to after mode switch (dispatched as bb-navigate).
   * E.g. 'invoices', 'inbox', 'tasks'.
   */
  targetPageId?: string;
  /**
   * Sidebar selection ID to set after navigation.
   * Used to auto-select a specific item in the mode's sidebar variant.
   */
  selectionId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ModeActionCardProps {
  data: ModeActionCardData;
  /** Optional icon element to render on the left. */
  icon?: React.ReactNode;
  className?: string;
}

export function ModeActionCard({ data, icon, className }: ModeActionCardProps) {
  const modeStore = useModeStoreOptional();

  const handleClick = useCallback(() => {
    if (!MODES_ENABLED || !modeStore) return;

    // Step 1: Switch mode
    if (data.targetMode) {
      modeStore.switchMode(data.targetMode);
    }

    // Step 2: Navigate to target page via bb-navigate custom event
    if (data.targetPageId) {
      window.dispatchEvent(
        new CustomEvent('bb-navigate', { detail: { tabId: data.targetPageId } })
      );
    }

    // Step 3: Set sidebar selection
    if (data.selectionId) {
      modeStore.setSidebarSelection(data.selectionId);
    }
  }, [data, modeStore]);

  const isInteractive = MODES_ENABLED && (data.targetMode || data.targetPageId);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isInteractive}
      className={cn(
        'group flex w-full items-start gap-3 rounded-xl border border-border',
        'bg-card px-4 py-3 text-left',
        'transition-colors duration-150',
        isInteractive
          ? 'cursor-pointer hover:bg-muted/60 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
          : 'cursor-default opacity-70',
        className,
      )}
      aria-label={
        data.targetMode
          ? `${data.label} — switch to ${data.targetMode} mode`
          : data.label
      }
    >
      {icon && (
        <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-snug">
          {data.label}
        </p>
        {data.description && (
          <p className="mt-0.5 text-sm text-muted-foreground leading-snug">
            {data.description}
          </p>
        )}
      </div>
      {isInteractive && (
        <span className="ml-auto mt-0.5 shrink-0 text-xs text-muted-foreground/60 transition-colors group-hover:text-muted-foreground">
          ↗
        </span>
      )}
    </button>
  );
}

export default ModeActionCard;
