/**
 * BitBit DS — Manifest (single source of truth)
 *
 * Typed registry of every canonical primitive. Both human-readable and
 * agent-readable: any code agent can `import { dsManifest } from '@/components/ds'`
 * and reason about the entire DS without grep.
 *
 * The /dev/ds canvas iterates this manifest. New primitives → add an entry
 * here, the canvas updates automatically.
 *
 * Discipline rules (READ BEFORE REINVENTING):
 *   1. Search this manifest before building a new component.
 *   2. If a primitive matches your need by `replaces[]`, USE IT — don't roll your own.
 *   3. If your need genuinely isn't covered, propose adding a new entry first.
 *   4. Avoid `status: 'deprecated'` entries — they're listed for context only.
 */

import type { ComponentType, ReactNode } from 'react'
import {
  IconUser,
  IconMail,
  IconChevronRight,
  IconCircleFilled,
  IconInbox,
} from '@tabler/icons-react'
import { ListRow } from './molecules/list-row'
import { StatusDot } from './atoms/status-dot'
import { Kbd } from './atoms/kbd'
import { Spinner } from './atoms/spinner'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────

export type DSTier = 'atom' | 'molecule' | 'organism' | 'template'
export type DSStatus = 'canonical' | 'experimental' | 'legacy' | 'deprecated'

export interface DSEntry {
  /** Component reference. Canvas calls this directly to render examples. */
  component: ComponentType<any>
  /** Atomic-design tier. */
  tier: DSTier
  /** Lifecycle status. Agents prefer 'canonical' and avoid 'deprecated'. */
  status: DSStatus
  /** One-line description. */
  description: string
  /** Patterns this primitive replaces — tells agents not to reinvent. */
  replaces: string[]
  /** Related primitives the agent might also consider. */
  related: string[]
  /** Single canonical code example agents can copy-paste. */
  example: string
  /** Anti-pattern guidance — when to reach for something else. */
  whenNotToUse?: string
  /** Live render samples for the canvas. */
  samples: Array<{ label: string; render: () => ReactNode }>
}

export type DSManifest = {
  atoms: Record<string, DSEntry>
  molecules: Record<string, DSEntry>
  organisms: Record<string, DSEntry>
  templates: Record<string, DSEntry>
}

// ─── Manifest entries ─────────────────────────────────────────────────────

export const dsManifest: DSManifest = {
  atoms: {
    Kbd: {
      component: Kbd,
      tier: 'atom',
      status: 'canonical',
      description:
        'Keyboard shortcut hint pill. Single key (⌘, K, ↵) or word (Esc). Pure token-based — uses .nano typography + theme colors.',
      replaces: [
        'bare `<kbd>` elements with no styling',
        'inline-styled `<kbd className="inline-flex rounded-lg...">` patterns',
        'legacy `bb-shortcuts-key` class',
      ],
      related: ['StatusDot (for inline status pills)'],
      example: `<Kbd>⌘K</Kbd>
<Kbd variant="solid">↵</Kbd>`,
      whenNotToUse:
        'For multi-line keyboard hints with descriptions → use a Row primitive with Kbd inside. For copy-paste-style code snippets → use <code>.',
      samples: [
        {
          label: 'Default',
          render: () => (
            <div className="flex items-center gap-2">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
              <span className="caption text-muted-foreground">open palette</span>
            </div>
          ),
        },
        {
          label: 'Solid (active state)',
          render: () => (
            <div className="flex items-center gap-2">
              <Kbd variant="solid">↵</Kbd>
              <span className="caption text-muted-foreground">select</span>
            </div>
          ),
        },
        {
          label: 'Word labels',
          render: () => (
            <div className="flex items-center gap-3">
              <Kbd>Esc</Kbd>
              <Kbd>Tab</Kbd>
              <Kbd>Shift</Kbd>
            </div>
          ),
        },
      ],
    },
    Spinner: {
      component: Spinner,
      tier: 'atom',
      status: 'canonical',
      description:
        'Loading indicator. Spinning Tabler IconLoader2 sized via .icon-{xs,sm,md,lg,xl} tokens. Default size sm (16px).',
      replaces: [
        'inline `<IconLoader2 className="size-4 animate-spin" />` (10+ sites)',
        'ui/spinner.tsx (4 sites — sweep target, status: legacy)',
      ],
      related: [
        'PulseDots (planned, for "agent thinking" pulse-dot indicator — different visual)',
      ],
      example: `<Spinner />              {/* size sm, default */}
<Spinner size="md" />     {/* 20px, button trailing */}
<Spinner label="Saving" /> {/* custom a11y label */}`,
      whenNotToUse:
        'For "agent is thinking" indicator → use PulseDots (different visual semantics). For long-running progress with %, use ui/Progress.',
      samples: [
        {
          label: 'Sizes',
          render: () => (
            <div className="flex items-center gap-4">
              <Spinner size="xs" />
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
              <Spinner size="xl" />
            </div>
          ),
        },
        {
          label: 'In context',
          render: () => (
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">Loading messages…</span>
            </div>
          ),
        },
      ],
    },
    StatusDot: {
      component: StatusDot,
      tier: 'atom',
      status: 'canonical',
      description:
        'Inline colored dot indicating semantic status (success/warning/danger/info/muted) or trend (active/stable/cooling/cold). Required `label` prop for screen readers.',
      replaces: [
        'inline `<span className="size-2 rounded-full bg-emerald-500" />` patterns',
        'opacity-only trend dots without aria-label',
      ],
      related: ['ui/Badge'],
      example: `<StatusDot variant="success" label="Online" />`,
      whenNotToUse:
        'Multi-line status with text content → use ui/Badge. Connection-status with icon + label → use components/dashboard/connection-status.',
      samples: [
        {
          label: 'Semantic',
          render: () => (
            <div className="flex items-center gap-3">
              <StatusDot variant="success" label="Online" />
              <StatusDot variant="warning" label="Degraded" />
              <StatusDot variant="danger" label="Offline" />
              <StatusDot variant="info" label="Notice" />
              <StatusDot variant="muted" label="Idle" />
            </div>
          ),
        },
        {
          label: 'Trend (relationship health)',
          render: () => (
            <div className="flex items-center gap-3">
              <StatusDot variant="active" label="Active" />
              <StatusDot variant="stable" label="Stable" />
              <StatusDot variant="cooling" label="Cooling" />
              <StatusDot variant="cold" label="Cold" />
            </div>
          ),
        },
        {
          label: 'Sizes',
          render: () => (
            <div className="flex items-center gap-3">
              <StatusDot variant="success" label="6px" size={6} />
              <StatusDot variant="success" label="8px (default)" size={8} />
              <StatusDot variant="success" label="10px" size={10} />
              <StatusDot variant="success" label="12px" size={12} />
            </div>
          ),
        },
        {
          label: 'Pulse',
          render: () => <StatusDot variant="success" label="Live" pulse />,
        },
      ],
    },
  },
  molecules: {
    Empty: {
      component: Empty,
      tier: 'molecule',
      status: 'canonical',
      description:
        'Empty-state container from ui/. Compound API: Empty + EmptyHeader + EmptyMedia + EmptyTitle + EmptyDescription + EmptyContent. Already ships in ui/empty.tsx — registered here to make it discoverable so it stops being reimplemented.',
      replaces: [
        '4 ad-hoc empty-state implementations across dashboard, widgets, approval-queue, entity-detail',
        'inline `<div className="flex flex-col items-center text-center..."` containers',
      ],
      related: ['ui/Card (for non-empty content)', 'Spinner (for loading vs empty)'],
      example: `<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon">
      <IconInbox />
    </EmptyMedia>
    <EmptyTitle>No messages yet</EmptyTitle>
    <EmptyDescription>Connect a channel to start triaging.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>Connect channel</Button>
  </EmptyContent>
</Empty>`,
      whenNotToUse:
        'Loading state with spinner → use Spinner inline. Error state with retry → use a dedicated error component (planned).',
      samples: [
        {
          label: 'With icon and CTA',
          render: () => (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconInbox />
                </EmptyMedia>
                <EmptyTitle>No messages yet</EmptyTitle>
                <EmptyDescription>
                  Connect a channel to start triaging.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm">Connect channel</Button>
              </EmptyContent>
            </Empty>
          ),
        },
        {
          label: 'Title + description only',
          render: () => (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>All caught up</EmptyTitle>
                <EmptyDescription>
                  Nothing in your queue. Take a breath.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ),
        },
      ],
    },
    ListRow: {
      component: ListRow,
      tier: 'molecule',
      status: 'canonical',
      description:
        'Clickable row primitive: leading slot + content + trailing slot. Owns layout, hover/selected states, and a11y. Caller decides typography and inner composition.',
      replaces: [
        'bespoke row containers in activity-item.tsx, lead-card.tsx, inbox-list.tsx (InboxRow)',
        'channel-card.tsx and widget-card.tsx where they are row-shaped',
      ],
      related: ['ui/Card (for grid/stacked containers, not rows)'],
      example: `<ListRow leading={<Avatar />} trailing={<Time />}>
  <div className="flex items-baseline justify-between">
    <span className="text-sm font-medium">{name}</span>
  </div>
  <p className="micro text-muted-foreground">{preview}</p>
</ListRow>`,
      whenNotToUse:
        'For draggable rows in kanban (use drag-aware variant). For grid-style cards with multiple sections, use ui/Card.',
      samples: [
        {
          label: 'Default',
          render: () => (
            <div className="rounded-xl border border-border bg-card p-2">
              <ListRow
                leading={
                  <div className="flex size-7 items-center justify-center rounded-full bg-muted">
                    <IconUser className="icon-sm text-muted-foreground" />
                  </div>
                }
                trailing={<span className="caption text-muted-foreground">2m</span>}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">Maya Mendoza</span>
                  <StatusDot variant="active" label="Active" size={6} />
                </div>
                <p className="micro truncate text-muted-foreground">
                  Website rebuild · awaiting hosting credentials
                </p>
              </ListRow>
            </div>
          ),
        },
        {
          label: 'Selected',
          render: () => (
            <div className="rounded-xl border border-border bg-card p-2">
              <ListRow
                selected
                leading={
                  <div className="flex size-7 items-center justify-center rounded-full bg-emerald-500/10">
                    <IconMail className="icon-sm text-emerald-500" />
                  </div>
                }
                trailing={<IconChevronRight className="icon-sm text-muted-foreground" />}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">Steve West</span>
                  <span className="caption shrink-0 text-muted-foreground">12m</span>
                </div>
                <p className="micro truncate text-muted-foreground">
                  Re: Phase 2 SEO — happy to proceed
                </p>
              </ListRow>
            </div>
          ),
        },
        {
          label: 'Compact (size=sm)',
          render: () => (
            <div className="rounded-xl border border-border bg-card p-2">
              <ListRow
                size="sm"
                leading={<IconCircleFilled className="icon-xs text-amber-500" />}
              >
                <span className="text-sm">Compact row · sm size · no trailing</span>
              </ListRow>
            </div>
          ),
        },
      ],
    },
  },
  organisms: {},
  templates: {},
}

// ─── Helpers for agents (and canvas) ──────────────────────────────────────

export function dsEntries(tier?: DSTier): Array<[string, DSEntry]> {
  if (tier) {
    const tierKey = `${tier}s` as keyof DSManifest
    return Object.entries(dsManifest[tierKey])
  }
  return [
    ...Object.entries(dsManifest.atoms),
    ...Object.entries(dsManifest.molecules),
    ...Object.entries(dsManifest.organisms),
    ...Object.entries(dsManifest.templates),
  ]
}

/** Find canonical replacements for a known legacy pattern (substring match on `replaces[]`). */
export function findReplacement(legacyPattern: string): Array<[string, DSEntry]> {
  return dsEntries().filter(([, entry]) =>
    entry.replaces.some((r) =>
      r.toLowerCase().includes(legacyPattern.toLowerCase()),
    ),
  )
}
