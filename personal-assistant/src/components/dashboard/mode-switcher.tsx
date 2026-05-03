'use client';

/**
 * ModeSwitcher — Header tab bar for dashboard mode switching.
 *
 * Renders 4 mode tabs (Chat · Inbox · Work · Money) with a sliding
 * 2px underline indicator using the FLIP technique for smooth animation.
 *
 * Design constraints (T038 monochrome):
 * - Single brand accent (--color-primary) for active underline. NO per-mode colors.
 * - Mode differentiated by icon + label + underline position.
 * - prefers-reduced-motion: instant snap (no transition).
 * - ARIA role=tablist / role=tab for accessibility.
 */

import React, { useRef, useLayoutEffect, useState, useCallback, useId } from 'react';
import {
  IconMessageCircle,
  IconInbox,
  IconBriefcase,
  IconCoin,
  IconLock,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Mode } from '@/lib/dashboard/mode-store';
import type { PlanName } from '@/lib/billing/plan-gates';

// ─── Mode definitions ─────────────────────────────────────────────────────────

interface ModeDefinition {
  id: Mode;
  label: string;
  shortcut: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

const MODES: ModeDefinition[] = [
  { id: 'chat',  label: 'Chat',  shortcut: '⌘1', Icon: IconMessageCircle },
  { id: 'inbox', label: 'Inbox', shortcut: '⌘2', Icon: IconInbox },
  { id: 'work',  label: 'Work',  shortcut: '⌘3', Icon: IconBriefcase },
  { id: 'money', label: 'Money', shortcut: '⌘4', Icon: IconCoin },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ModeSwitcherProps {
  active: Mode;
  onSwitch: (mode: Mode) => void;
  /** Optional live count badge per mode (placeholder 0 for Phase 1) */
  counts?: Partial<Record<Mode, number>>;
  /**
   * Per-mode lock map. If a mode appears here, its tab renders as locked
   * (lock icon + muted style). Clicking a locked tab fires `onLockedModeClick`
   * (or no-ops) instead of `onSwitch`. Source: `useModeEntitlements()`.
   */
  lockedModes?: Partial<Record<Mode, { requiredPlan: PlanName }>>;
  /** Called when a locked tab is clicked, e.g. to open an upsell modal. */
  onLockedModeClick?: (mode: Mode, requiredPlan: PlanName) => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ModeSwitcher({
  active,
  onSwitch,
  counts = {},
  lockedModes = {},
  onLockedModeClick,
  className,
}: ModeSwitcherProps) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({
    chat: null,
    inbox: null,
    work: null,
    money: null,
  });

  // Indicator position state: left offset + width in px
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  // Track whether reduced-motion is preferred
  const [reducedMotion, setReducedMotion] = useState(false);

  // Detect prefers-reduced-motion on mount (client only)
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // FLIP: update indicator position whenever active mode changes
  useLayoutEffect(() => {
    const el = tabRefs.current[active];
    const container = listRef.current;
    if (!el || !container) return;

    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const left = elRect.left - containerRect.left;
    const width = elRect.width;

    setIndicator({ left, width });
  }, [active]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const modes = MODES.map(m => m.id);
      const currentIdx = modes.indexOf(active);

      // Skip locked modes when arrow-stepping. Loops at most 4× (one cycle)
      // before bailing out — guards against an all-locked state.
      function nextEnabled(direction: 1 | -1): Mode | null {
        for (let i = 1; i <= modes.length; i++) {
          const candidate = modes[(currentIdx + direction * i + modes.length * i) % modes.length];
          if (!lockedModes[candidate]) return candidate;
        }
        return null;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = nextEnabled(1);
        if (next) {
          onSwitch(next);
          tabRefs.current[next]?.focus();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = nextEnabled(-1);
        if (prev) {
          onSwitch(prev);
          tabRefs.current[prev]?.focus();
        }
      }
    },
    [active, onSwitch, lockedModes],
  );

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Dashboard mode"
      onKeyDown={handleKeyDown}
      className={cn('relative flex items-center gap-0.5', className)}
    >
      {MODES.map((mode) => {
        const isActive = mode.id === active;
        const count = counts[mode.id] ?? 0;
        const lock = lockedModes[mode.id];
        const isLocked = Boolean(lock);

        return (
          <Tooltip key={mode.id}>
            <TooltipTrigger asChild>
              <button
                ref={(el) => { tabRefs.current[mode.id] = el; }}
                role="tab"
                id={`${id}-tab-${mode.id}`}
                aria-selected={isActive && !isLocked}
                aria-disabled={isLocked}
                aria-controls={`${id}-panel-${mode.id}`}
                tabIndex={isActive && !isLocked ? 0 : -1}
                onClick={() => {
                  if (isLocked) {
                    onLockedModeClick?.(mode.id, lock!.requiredPlan);
                    return;
                  }
                  onSwitch(mode.id);
                }}
                className={cn(
                  // Base: tight pill, DM Sans 500 14/20
                  'relative flex items-center gap-1.5 rounded-md px-3 py-1.5',
                  'text-sm font-medium leading-5 select-none',
                  'transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  // Locked: muted, lower opacity, default cursor stays clickable for upsell
                  isLocked && 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/30',
                  // Active (only when NOT locked): subtle background tint + primary text
                  !isLocked && isActive && 'text-foreground bg-accent',
                  !isLocked && !isActive && 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                )}
              >
                {isLocked ? (
                  <IconLock size={13} className="shrink-0" />
                ) : (
                  <mode.Icon size={15} className="shrink-0" />
                )}
                <span>{mode.label}</span>
                {count > 0 && (
                  <span
                    aria-label={`${count} items`}
                    className={cn(
                      'ml-0.5 inline-flex h-4 min-w-4 items-center justify-center',
                      'rounded-full px-1 text-[10px] font-semibold leading-none',
                      'bg-primary/10 text-primary',
                    )}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <span>{mode.label}</span>
              {isLocked ? (
                <span className="ml-1.5 text-muted-foreground capitalize">
                  {lock!.requiredPlan} plan
                </span>
              ) : (
                <span className="ml-1.5 text-muted-foreground">{mode.shortcut}</span>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}

      {/* Sliding 2px underline indicator — FLIP-animated */}
      {indicator && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-primary',
          )}
          style={{
            left: indicator.left,
            width: indicator.width,
            // Transition only if motion is OK; instant snap otherwise
            transition: reducedMotion
              ? 'none'
              : 'left 200ms cubic-bezier(0.2, 0, 0, 1), width 200ms cubic-bezier(0.2, 0, 0, 1)',
          }}
        />
      )}
    </div>
  );
}
