'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TabSkeleton } from './tab-skeleton';
import {
  Inbox,
  Mail,
  MessageSquare,
  Filter,
  Clock,
  AlertCircle,
  CheckCircle2,
  Archive,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (mirrors server types)
// ---------------------------------------------------------------------------

type MessageCategory = 'actionable' | 'informational' | 'spam' | 'personal';
type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';
type ThreadStatus = 'waiting_on_you' | 'waiting_on_them' | 'resolved' | 'new';

interface InboxMessage {
  id: string;
  channelType: string;
  senderName: string | null;
  senderEmail: string | null;
  subject: string | null;
  bodyPreview: string;
  category: MessageCategory;
  priority: PriorityLevel;
  significance: number;
  contactId: string | null;
  contactName: string | null;
  threadStatus: ThreadStatus | null;
  deduplicatedWith: string | null;
  receivedAt: string;
  processedAt: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANNEL_ICONS: Record<string, string> = {
  gmail: 'G',
  outlook: 'O',
  whatsapp: 'W',
  imessage: 'iM',
  asana: 'A',
  calendly: 'Ca',
  stripe: '$',
};

const PRIORITY_COLORS: Record<PriorityLevel, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  medium: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  low: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

const CATEGORY_LABELS: Record<MessageCategory, string> = {
  actionable: 'Action Required',
  informational: 'Informational',
  spam: 'Noise',
  personal: 'Personal',
};

const THREAD_STATUS_LABELS: Record<ThreadStatus, { label: string; color: string }> = {
  waiting_on_you: { label: 'Waiting on you', color: 'text-amber-400' },
  waiting_on_them: { label: 'Waiting on them', color: 'text-emerald-400' },
  resolved: { label: 'Resolved', color: 'text-zinc-400' },
  new: { label: 'New', color: 'text-blue-400' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function InboxTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [total, setTotal] = useState(0);

  // Filters
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchInbox = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (channelFilter) params.set('channel', channelFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '50');

      const response = await fetch(`/api/agent/inbox?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('[inbox-tab] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [channelFilter, priorityFilter, statusFilter]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  // Subscribe to realtime updates
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel('inbox-updates')
      .on('postgres_changes' as never, { event: 'INSERT', schema: 'public', table: 'channel_messages' }, () => {
        fetchInbox(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInbox]);

  const handleRunTriage = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/agent/triage', { method: 'POST' });
      await fetchInbox(true);
    } catch {
      setRefreshing(false);
    }
  };

  if (loading) return <TabSkeleton />;

  const actionableCount = messages.filter(m => m.category === 'actionable').length;
  const unreadCount = messages.filter(m => m.status === 'unread').length;
  const waitingOnYouCount = messages.filter(m => m.threadStatus === 'waiting_on_you').length;

  return (
    <div className="flex-1 overflow-y-auto h-full p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Unified Inbox</h1>
            <p className="text-sm text-muted-foreground">
              {total} messages across all channels
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]"
          >
            <Filter size={14} />
            Filters
            <ChevronDown size={12} className={showFilters ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          <button
            onClick={handleRunTriage}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Triaging...' : 'Run Triage'}
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <p className="text-[11px] text-muted-foreground">Unread</p>
          <p className="text-lg font-semibold">{unreadCount}</p>
        </div>
        <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <p className="text-[11px] text-muted-foreground">Action Required</p>
          <p className="text-lg font-semibold text-amber-400">{actionableCount}</p>
        </div>
        <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <p className="text-[11px] text-muted-foreground">Waiting on You</p>
          <p className="text-lg font-semibold text-red-400">{waitingOnYouCount}</p>
        </div>
        <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <p className="text-[11px] text-muted-foreground">Total</p>
          <p className="text-lg font-semibold">{total}</p>
        </div>
      </div>

      {/* Filters Bar */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-element)] min-w-[100px]"
          >
            <option value="">All Channels</option>
            <option value="gmail">Gmail</option>
            <option value="outlook">Outlook</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="asana">Asana</option>
            <option value="calendly">Calendly</option>
            <option value="stripe">Stripe</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-element)] min-w-[100px]"
          >
            <option value="">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-element)] min-w-[100px]"
          >
            <option value="">All Status</option>
            <option value="unread">Unread</option>
            <option value="actioned">Actioned</option>
            <option value="archived">Archived</option>
          </select>

          {(channelFilter || priorityFilter || statusFilter) && (
            <button
              onClick={() => { setChannelFilter(''); setPriorityFilter(''); setStatusFilter(''); }}
              className="text-xs px-2 py-1.5 text-muted-foreground hover:text-[var(--text-primary)]"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Message List */}
      <div className="space-y-2">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Inbox size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No messages to show.</p>
            <p className="text-xs mt-1">Try adjusting your filters or run triage to process new messages.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageRow key={msg.id} message={msg} />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Row
// ---------------------------------------------------------------------------

function MessageRow({ message }: { message: InboxMessage }) {
  const channelIcon = CHANNEL_ICONS[message.channelType] || message.channelType.slice(0, 2).toUpperCase();
  const priorityClass = PRIORITY_COLORS[message.priority];
  const threadInfo = message.threadStatus ? THREAD_STATUS_LABELS[message.threadStatus] : null;
  const isUnread = message.status === 'unread';
  const timeAgo = formatTimeAgo(message.receivedAt);

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
      isUnread
        ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5'
        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
    } hover:bg-[var(--bg-hover)]`}>
      {/* Channel badge */}
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--bg-element)] flex items-center justify-center text-[10px] font-bold text-muted-foreground">
        {channelIcon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-sm font-medium truncate ${isUnread ? 'text-[var(--text-primary)]' : 'text-muted-foreground'}`}>
            {message.contactName || message.senderName || message.senderEmail || 'Unknown'}
          </span>
          {message.contactId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
              Known
            </span>
          )}
          {threadInfo && (
            <span className={`text-[10px] ${threadInfo.color}`}>
              {threadInfo.label}
            </span>
          )}
        </div>

        {message.subject && (
          <p className={`text-xs truncate ${isUnread ? 'font-medium' : ''}`}>
            {message.subject}
          </p>
        )}

        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {message.bodyPreview}
        </p>
      </div>

      {/* Right side: priority + time */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${priorityClass}`}>
          {message.priority}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {timeAgo}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {CATEGORY_LABELS[message.category] || message.category}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default React.memo(InboxTab);
