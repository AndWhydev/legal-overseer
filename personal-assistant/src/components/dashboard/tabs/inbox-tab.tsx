'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { useDevOverrides } from '@/lib/dev/dev-overrides';
import { TabSkeleton } from './tab-skeleton';
import { TabShell } from '@/components/ui/tab-shell';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Mail,
  MessageCircle,
  Smartphone,
  CheckSquare,
  Filter,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  Calendar as CalendarIcon,
  CreditCard,
  X,
  Sparkles,
  Archive,
  Clock,
} from 'lucide-react';
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill';

// ---------------------------------------------------------------------------
// Types
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
// Constants — minimal, Superhuman-inspired
// ---------------------------------------------------------------------------

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  gmail: Mail,
  outlook: Mail,
  whatsapp: MessageCircle,
  imessage: Smartphone,
  asana: CheckSquare,
  calendly: CalendarIcon,
  stripe: CreditCard,
};

const CATEGORY_VARIANT: Record<MessageCategory, StatusVariant> = {
  actionable: 'orange',
  informational: 'info',
  spam: 'neutral',
  personal: 'purple',
};

const SEED_MESSAGES: InboxMessage[] = [
  {
    id: 's1', channelType: 'gmail', senderName: 'Sarah Chen', senderEmail: 'sarah@designstudio.co',
    subject: 'Website revision — final round feedback', bodyPreview: 'Hey, the client loved the new hero section but wants the CTA button colour changed to match their brand guide...',
    category: 'actionable', priority: 'high', significance: 8, contactId: 'c1', contactName: 'Sarah Chen',
    threadStatus: 'waiting_on_you', deduplicatedWith: null, receivedAt: new Date(Date.now() - 12 * 60000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  {
    id: 's2', channelType: 'whatsapp', senderName: 'Andy Wu', senderEmail: null,
    subject: null, bodyPreview: 'Can you check the Sentry dashboard? Getting a spike in 500s on the checkout flow since the last deploy',
    category: 'actionable', priority: 'critical', significance: 9, contactId: 'c2', contactName: 'Andy Wu',
    threadStatus: 'waiting_on_you', deduplicatedWith: null, receivedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  {
    id: 's3', channelType: 'asana', senderName: 'Asana', senderEmail: 'notifications@asana.com',
    subject: 'Task assigned: Q1 brand refresh deliverables', bodyPreview: 'You have been assigned to "Q1 brand refresh deliverables" in project Brand & Identity. Due: Mar 7',
    category: 'actionable', priority: 'medium', significance: 6, contactId: null, contactName: null,
    threadStatus: 'new', deduplicatedWith: null, receivedAt: new Date(Date.now() - 45 * 60000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  {
    id: 's4', channelType: 'stripe', senderName: 'Stripe', senderEmail: 'notifications@stripe.com',
    subject: 'Payment received — $4,200.00', bodyPreview: 'Invoice INV-2024-0089 for DesignStudio Co has been paid. Amount: $4,200.00 AUD',
    category: 'informational', priority: 'low', significance: 4, contactId: 'c1', contactName: 'Sarah Chen',
    threadStatus: null, deduplicatedWith: null, receivedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  {
    id: 's5', channelType: 'gmail', senderName: 'Tom Bradley', senderEmail: 'tom@acmecorp.com',
    subject: 'Re: Proposal for Q2 retainer', bodyPreview: "Thanks for sending that through. I've shared it with our CFO. Expecting a decision by end of week.",
    category: 'informational', priority: 'medium', significance: 5, contactId: 'c3', contactName: 'Tom Bradley',
    threadStatus: 'waiting_on_them', deduplicatedWith: null, receivedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'actioned',
  },
  {
    id: 's6', channelType: 'calendly', senderName: 'Calendly', senderEmail: 'notifications@calendly.com',
    subject: 'New booking: Discovery call with Mira Patel', bodyPreview: 'Mira Patel booked a 30-min discovery call for tomorrow at 10:00 AM AEST',
    category: 'informational', priority: 'medium', significance: 5, contactId: null, contactName: 'Mira Patel',
    threadStatus: 'new', deduplicatedWith: null, receivedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'actioned',
  },
  {
    id: 's7', channelType: 'gmail', senderName: 'LinkedIn', senderEmail: 'notifications@linkedin.com',
    subject: '3 people viewed your profile', bodyPreview: 'Your profile was viewed by a Product Manager at Canva, a Design Lead at Atlassian, and 1 other',
    category: 'spam', priority: 'low', significance: 1, contactId: null, contactName: null,
    threadStatus: null, deduplicatedWith: null, receivedAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'archived',
  },
  {
    id: 's8', channelType: 'whatsapp', senderName: 'Jess Reilly', senderEmail: null,
    subject: null, bodyPreview: 'Lunch tomorrow? That new ramen place on Crown St just opened',
    category: 'personal', priority: 'low', significance: 3, contactId: 'c4', contactName: 'Jess Reilly',
    threadStatus: 'waiting_on_you', deduplicatedWith: null, receivedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function InboxTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [total, setTotal] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Dev seed data — controlled from dev toolbar, not in this component
  const devOverrides = useDevOverrides();
  const useSeeded = devOverrides?.seed_data?.inbox ?? false;

  const fetchInbox = useCallback(async (isRefresh = false) => {
    if (useSeeded) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (channelFilter) params.set('channel', channelFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '50');

      const response = await fetch(`/api/agent/inbox?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setMessages(data.messages || []);
      setTotal(data.total || 0);
      setError(null);
    } catch (err) {
      console.error('[inbox-tab] fetch error:', err);
      setError('Failed to load inbox');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [channelFilter, priorityFilter, statusFilter, useSeeded]);

  useEffect(() => {
    if (useSeeded) {
      setMessages(SEED_MESSAGES);
      setTotal(SEED_MESSAGES.length);
      setLoading(false);
      return;
    }
    fetchInbox();
  }, [fetchInbox, useSeeded]);

  const [newMessageAlert, setNewMessageAlert] = useState(false);

  useRealtimeSubscription('channel_messages', { event: 'INSERT' }, () => {
    setNewMessageAlert(true);
    if (!useSeeded) fetchInbox(true);
  });

  const handleRunTriage = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/agent/triage', { method: 'POST' });
      await fetchInbox(true);
    } catch {
      setRefreshing(false);
    }
  };

  const hasActiveFilters = channelFilter || priorityFilter || statusFilter;

  const clearFilters = () => {
    setChannelFilter('');
    setPriorityFilter('');
    setStatusFilter('');
  };

  const displayed = messages.filter(m => {
    if (channelFilter && m.channelType !== channelFilter) return false;
    if (priorityFilter && m.priority !== priorityFilter) return false;
    if (statusFilter && m.status !== statusFilter) return false;
    return true;
  });

  if (loading && !useSeeded) return <TabSkeleton />;

  if (error && messages.length === 0) {
    return (
      <TabShell>
        <div className="bb-tab-error">
          <p className="bb-tab-error__text">{error}</p>
          <button className="bb-btn bb-btn--ghost bb-btn--sm" onClick={() => fetchInbox()}>
            Retry
          </button>
        </div>
      </TabShell>
    );
  }

  const unreadCount = displayed.filter(m => m.status === 'unread').length;
  const actionableCount = displayed.filter(m => m.category === 'actionable').length;
  const waitingCount = displayed.filter(m => m.threadStatus === 'waiting_on_you').length;
  const totalCount = useSeeded ? displayed.length : total;

  return (
    <TabShell>
      {/* ── Inline Stats — Superhuman style: text-only, inline ── */}
      <div className="bb-inbox-stats">
        <StatPill value={unreadCount} label="unread" active={unreadCount > 0} />
        <span className="bb-inbox-stats__sep" />
        <StatPill value={actionableCount} label="action needed" active={actionableCount > 0} />
        <span className="bb-inbox-stats__sep" />
        <StatPill value={waitingCount} label="needs reply" active={waitingCount > 0} />
        <span className="bb-inbox-stats__sep" />
        <StatPill value={totalCount} label="total" />
      </div>

      {/* ── Action Bar ── */}
      <div className="bb-inbox-actions">
        <div className="bb-inbox-actions__left">
          {newMessageAlert && (
            <button
              onClick={() => setNewMessageAlert(false)}
              className="bb-chip"
              style={{ color: 'var(--bb-green)' }}
            >
              <span className="bb-inbox-pulse" />
              New messages
            </button>
          )}
          {hasActiveFilters && (
            <button onClick={clearFilters} className="bb-chip">
              <X size={12} />
              Clear
            </button>
          )}
        </div>

        <div className="bb-inbox-actions__right">
          <button
            onClick={() => setShowFilters(f => !f)}
            className="bb-chip"
            data-active={showFilters || undefined}
          >
            <Filter size={12} />
            Filters
            <ChevronDown
              size={10}
              style={{
                transform: showFilters ? 'rotate(180deg)' : 'none',
                transition: 'transform var(--duration-fast) var(--ease-default)',
              }}
            />
          </button>
          <button
            onClick={handleRunTriage}
            disabled={refreshing}
            className="bb-chip bb-chip--accent"
          >
            {refreshing ? (
              <><RefreshCw size={12} className="animate-spin" /> Triaging...</>
            ) : (
              <><Sparkles size={12} /> Auto-triage</>
            )}
          </button>
        </div>
      </div>

      {/* ── Filter Drawer ── */}
      {showFilters && (
        <div className="bb-inbox-filters">
          <InboxSelect
            value={channelFilter}
            onChange={setChannelFilter}
            label="Channel"
            options={[
              { value: '', label: 'All Channels' },
              { value: 'gmail', label: 'Gmail' },
              { value: 'outlook', label: 'Outlook' },
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'asana', label: 'Asana' },
              { value: 'calendly', label: 'Calendly' },
              { value: 'stripe', label: 'Stripe' },
            ]}
          />
          <InboxSelect
            value={priorityFilter}
            onChange={setPriorityFilter}
            label="Priority"
            options={[
              { value: '', label: 'All Priorities' },
              { value: 'critical', label: 'Critical' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
          />
          <InboxSelect
            value={statusFilter}
            onChange={setStatusFilter}
            label="Status"
            options={[
              { value: '', label: 'All Status' },
              { value: 'unread', label: 'Unread' },
              { value: 'actioned', label: 'Actioned' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          {hasActiveFilters && (
            <button onClick={clearFilters} className="bb-btn bb-btn--ghost bb-btn--sm">
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── Message List — flat, borderless ── */}
      <div className="bb-inbox-list">
        {displayed.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={40} />}
            title="All caught up"
            description="No messages to show. Adjust your filters or wait for new messages."
          />
        ) : (
          displayed.map((msg) => (
            <MessageRow key={msg.id} message={msg} />
          ))
        )}
      </div>
    </TabShell>
  );
}

// ---------------------------------------------------------------------------
// Stat Pill — inline text stat, not a card
// ---------------------------------------------------------------------------

function StatPill({ value, label, active }: { value: number; label: string; active?: boolean }) {
  return (
    <span className="bb-inbox-stats__item" data-active={active || undefined}>
      <span className="bb-inbox-stats__value">{value}</span>
      <span className="bb-inbox-stats__label">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

function InboxSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bb-inbox-select"
      aria-label={label}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Message Row — Superhuman-inspired: flat, no border, spacing-based
// ---------------------------------------------------------------------------

function MessageRow({ message }: { message: InboxMessage }) {
  const ChannelIcon = CHANNEL_ICONS[message.channelType] || Mail;
  const isUnread = message.status === 'unread';
  const isImportant = message.significance >= 7;
  const timeAgo = formatTimeAgo(message.receivedAt);
  const sender = message.contactName || message.senderName || message.senderEmail || 'Unknown';

  const level = message.significance >= 8 ? 'critical' :
    message.significance >= 6 ? 'high' :
    message.significance >= 5 ? 'medium' : undefined;

  return (
    <div
      className="bb-inbox-row"
      data-unread={isUnread || undefined}
      data-important={isImportant || undefined}
      data-level={level}
    >
      {/* Channel icon — small, muted */}
      <div className="bb-inbox-row__icon">
        <ChannelIcon size={14} />
      </div>

      {/* Content — Superhuman layout: sender + subject inline, preview below */}
      <div className="bb-inbox-row__content">
        <div className="bb-inbox-row__line1">
          <span className="bb-inbox-row__sender">{sender}</span>
          {message.subject && (
            <>
              <span className="bb-inbox-row__dash">&mdash;</span>
              <span className="bb-inbox-row__subject">{message.subject}</span>
            </>
          )}
        </div>
        <p className="bb-inbox-row__preview">{message.bodyPreview}</p>
      </div>

      {/* Meta — right aligned, minimal */}
      <div className="bb-inbox-row__meta">
        <StatusPill
          variant={CATEGORY_VARIANT[message.category]}
          label={message.category}
          dot
        />
        <span className="bb-inbox-row__time">{timeAgo}</span>
        {message.threadStatus === 'waiting_on_you' && (
          <span className="bb-inbox-row__badge">Reply</span>
        )}
        {message.threadStatus === 'waiting_on_them' && (
          <span className="bb-inbox-row__badge bb-inbox-row__badge--dim">
            <Clock size={9} /> Waiting
          </span>
        )}
      </div>

      {/* Hover actions — fade in */}
      <div className="bb-inbox-row__hover-actions">
        <button className="bb-inbox-row__action" title="Archive" aria-label="Archive message">
          <Archive size={14} />
        </button>
        <button className="bb-inbox-row__action" title="Done" aria-label="Mark as done">
          <CheckCircle2 size={14} />
        </button>
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
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default React.memo(InboxTab);
