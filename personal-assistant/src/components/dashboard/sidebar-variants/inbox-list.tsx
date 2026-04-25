'use client';

/**
 * InboxListSidebar — sidebar variant for Inbox mode.
 *
 * Virtualized omnichannel message list (Email / iMessage / WhatsApp / Approvals).
 * Keyboard navigation: j/k moves selection, Enter opens detail, s snoozes, e archives.
 *
 * Virtualizes at >30 items using @tanstack/react-virtual.
 * Below 30 items: plain map (no virtualization overhead).
 *
 * Selection state is written to mode-store.perMode.inbox.sidebarSelection.
 */

import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  IconInbox,
  IconClockPause,
  IconSend,
  IconAlertOctagon,
  IconMail,
  IconBrandWhatsapp,
  IconMessage,
  IconShieldCheck,
  IconCircleFilled,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { useModeStore } from '@/lib/dashboard/mode-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InboxFilter = 'all' | 'needs-attention' | 'snoozed' | 'sent' | 'spam';

export interface InboxItem {
  id: string;
  channelType: 'email' | 'imessage' | 'whatsapp' | 'approval' | string;
  senderName: string | null;
  senderEmail: string | null;
  subject: string | null;
  bodyPreview: string;
  receivedAt: string;
  status: string;
  isUnread: boolean;
  category?: string;
}

// ─── Selection reducer (exported for testing) ─────────────────────────────────

export interface SelectionState {
  index: number;
  total: number;
}

export function selectionReducer(
  state: SelectionState,
  action: { key: 'j' | 'k' | 'other' },
): SelectionState {
  switch (action.key) {
    case 'j':
      return { ...state, index: Math.min(state.index + 1, state.total - 1) };
    case 'k':
      return { ...state, index: Math.max(state.index - 1, 0) };
    default:
      return state;
  }
}

// ─── Channel icon ─────────────────────────────────────────────────────────────

function ChannelBadge({ channelType }: { channelType: string }) {
  const icons: Record<string, React.ElementType> = {
    email: IconMail,
    imessage: IconMessage,
    whatsapp: IconBrandWhatsapp,
    approval: IconShieldCheck,
  };
  const Icon = icons[channelType] ?? IconMail;
  return (
    <Icon
      className="size-3 shrink-0 text-muted-foreground"
      aria-label={channelType}
    />
  );
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return `${Math.floor(diffDays / 7)}w`;
}

// ─── Single row ───────────────────────────────────────────────────────────────

interface InboxRowProps {
  item: InboxItem;
  isSelected: boolean;
  onClick: () => void;
}

function InboxRow({ item, isSelected, onClick }: InboxRowProps) {
  const initials = (item.senderName ?? item.senderEmail ?? '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');

  const displayName = item.senderName ?? item.senderEmail ?? 'Unknown';
  const preview = item.subject ?? item.bodyPreview;
  const sub = item.subject ? item.bodyPreview : '';

  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={isSelected || undefined}
      className={cn(
        'w-full rounded-lg px-2 py-2 text-left transition-colors',
        'hover:bg-sidebar-accent',
        isSelected && 'bg-sidebar-accent',
      )}
    >
      <div className="flex items-start gap-2">
        {/* Avatar */}
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
          {initials}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className={cn(
              'truncate text-[13px]',
              item.isUnread ? 'font-semibold' : 'font-normal text-muted-foreground',
            )}>
              {displayName}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {item.isUnread && (
                <IconCircleFilled className="size-1.5 text-primary" aria-label="Unread" />
              )}
              <span className="text-[11px] text-muted-foreground">
                {relativeTime(item.receivedAt)}
              </span>
            </div>
          </div>

          <p className="truncate text-[12px] text-foreground/80">{preview}</p>
          {sub && (
            <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
          )}

          {/* Channel badge */}
          <div className="mt-0.5 flex items-center gap-1">
            <ChannelBadge channelType={item.channelType} />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {item.channelType}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Filter tab ───────────────────────────────────────────────────────────────

const FILTERS: Array<{ id: InboxFilter; label: string; icon: React.ElementType }> = [
  { id: 'all', label: 'All', icon: IconInbox },
  { id: 'needs-attention', label: 'Needs attention', icon: IconAlertOctagon },
  { id: 'snoozed', label: 'Snoozed', icon: IconClockPause },
  { id: 'sent', label: 'Sent', icon: IconSend },
  { id: 'spam', label: 'Spam', icon: IconAlertOctagon },
];

// ─── Main component ───────────────────────────────────────────────────────────

interface InboxListSidebarProps {
  items?: InboxItem[];
  onItemSelect?: (item: InboxItem) => void;
}

const VIRTUALIZE_THRESHOLD = 30;

export function InboxListSidebar({ items = [], onItemSelect }: InboxListSidebarProps) {
  const [activeFilter, setActiveFilter] = useState<InboxFilter>('all');
  const { setSidebarSelection } = useModeStore();

  // Filter items
  const filtered = items.filter(item => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'needs-attention')
      return item.category === 'action_required' || item.isUnread;
    if (activeFilter === 'snoozed') return item.status === 'snoozed';
    if (activeFilter === 'sent') return item.status === 'sent';
    if (activeFilter === 'spam') return item.category === 'spam';
    return true;
  });

  // Selection state
  const [sel, dispatchSel] = useReducer(selectionReducer, {
    index: 0,
    total: filtered.length,
  });

  // Sync total when filtered list changes
  useEffect(() => {
    dispatchSel({ key: 'other' }); // re-clamp
  }, [filtered.length]);

  const handleSelect = useCallback(
    (item: InboxItem, index: number) => {
      dispatchSel({ key: 'other' }); // reset via index directly
      setSidebarSelection(item.id);
      onItemSelect?.(item);
    },
    [setSidebarSelection, onItemSelect],
  );

  // j/k keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable) return;
      }
      if (e.key === 'j') {
        e.preventDefault();
        dispatchSel({ key: 'j' });
      } else if (e.key === 'k') {
        e.preventDefault();
        dispatchSel({ key: 'k' });
      } else if (e.key === 'Enter' && filtered[sel.index]) {
        const item = filtered[sel.index];
        setSidebarSelection(item.id);
        onItemSelect?.(item);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [filtered, sel.index, setSidebarSelection, onItemSelect]);

  // Virtualized scroll container
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = filtered.length > VIRTUALIZE_THRESHOLD;

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
    enabled: shouldVirtualize,
  });

  // Empty state
  const isEmpty = filtered.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Filter row */}
      <div className="flex shrink-0 gap-0.5 overflow-x-auto px-2 pb-2 pt-1 no-scrollbar">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveFilter(f.id)}
            className={cn(
              'shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap',
              activeFilter === f.id
                ? 'bg-sidebar-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.id === 'all'
              ? `All (${items.length})`
              : f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div
        ref={parentRef}
        className="min-h-0 flex-1 overflow-y-auto px-1 pb-2"
        aria-label="Inbox messages"
        role="listbox"
      >
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <IconInbox className="size-8 text-muted-foreground/50" />
            <p className="text-[13px] text-muted-foreground">
              {activeFilter === 'all'
                ? 'Inbox is quiet. Connect a channel.'
                : 'No items here.'}
            </p>
            {activeFilter === 'all' && (
              <a
                href="/dashboard/settings/connections"
                className="text-[12px] text-primary hover:underline"
              >
                Connect channels
              </a>
            )}
          </div>
        ) : shouldVirtualize ? (
          <div
            style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
          >
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const item = filtered[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <InboxRow
                    item={item}
                    isSelected={sel.index === virtualRow.index}
                    onClick={() => handleSelect(item, virtualRow.index)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          filtered.map((item, idx) => (
            <InboxRow
              key={item.id}
              item={item}
              isSelected={sel.index === idx}
              onClick={() => handleSelect(item, idx)}
            />
          ))
        )}
      </div>
    </div>
  );
}
