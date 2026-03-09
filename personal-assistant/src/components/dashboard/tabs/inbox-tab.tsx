'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { useDevOverrides } from '@/lib/dev/dev-overrides';
import { TabShell } from '@/components/ui/tab-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { logger } from '@/lib/core/logger';
import {
  Filter,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  Calendar as CalendarIcon,
  X,
  Sparkles,
  Archive,
  Clock,
} from 'lucide-react';

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

// ── Brand SVG icons (Simple Icons, MIT) ──

function GmailIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
    </svg>
  );
}

function OutlookIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 7.387v10.478c0 .23-.08.424-.238.576a.806.806 0 01-.588.236h-8.108v-8.07l2.727 1.903.312.125a.39.39 0 00.32-.118l.61-.595a.39.39 0 00.124-.3.4.4 0 00-.164-.32L15.2 8.417h7.974c.234 0 .434.082.59.23.157.148.236.344.236.58v.16zM14.934 24H1.098A1.1 1.1 0 010 22.902V6.513a1.1 1.1 0 011.098-1.098h3.488V1.098A1.1 1.1 0 015.684 0h8.152a1.1 1.1 0 011.098 1.098v4.317h3.488a1.1 1.1 0 011.098 1.098v4.164h-5.586V24zM4.138 16.32c0 1.023.273 1.828.82 2.414.546.586 1.273.879 2.18.879.91 0 1.636-.293 2.18-.88.545-.585.82-1.39.82-2.413 0-1.016-.275-1.816-.824-2.4-.55-.585-1.274-.877-2.176-.877-.902 0-1.63.293-2.18.88-.546.586-.82 1.386-.82 2.398zm2.305-3.545c1.336 0 2.395.387 3.176 1.164.781.777 1.172 1.82 1.172 3.128 0 1.297-.39 2.332-1.168 3.11-.777.776-1.84 1.164-3.188 1.164-1.328 0-2.38-.387-3.152-1.16-.773-.774-1.16-1.813-1.16-3.114 0-1.313.39-2.356 1.172-3.132.781-.777 1.832-1.16 3.148-1.16z" />
    </svg>
  );
}

function WhatsAppIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function IMessageIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.916 0C5.335 0 0 4.434 0 9.904c0 3.098 1.746 5.862 4.479 7.63l-.727 2.905a.5.5 0 00.726.543l3.546-2.012c1.224.365 2.534.566 3.892.566 6.581 0 11.916-4.434 11.916-9.904-.004-5.466-5.339-9.632-11.916-9.632z" />
    </svg>
  );
}

function AsanaIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.78 12.653a5.22 5.22 0 100 10.44 5.22 5.22 0 000-10.44zm-13.56 0a5.22 5.22 0 100 10.44 5.22 5.22 0 000-10.44zM12 .907a5.22 5.22 0 100 10.44 5.22 5.22 0 000-10.44z" />
    </svg>
  );
}

function StripeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
    </svg>
  );
}

function CalendlyIcon({ size = 15 }: { size?: number }) {
  return <CalendarIcon size={size} />;
}

const CHANNEL_ICONS: Record<string, React.FC<{ size?: number }>> = {
  gmail: GmailIcon,
  outlook: OutlookIcon,
  whatsapp: WhatsAppIcon,
  imessage: IMessageIcon,
  asana: AsanaIcon,
  calendly: CalendlyIcon,
  stripe: StripeIcon,
};

const CHANNEL_BRAND_COLORS: Record<string, string> = {
  gmail: '#EA4335',
  outlook: '#0078D4',
  whatsapp: '#25D366',
  imessage: '#34C759',
  asana: '#F06A6A',
  calendly: '#006BFF',
  stripe: '#635BFF',
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
      logger.error('[inbox-tab] fetch error:', err);
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

  const [autoTriage, setAutoTriage] = useState(false);

  const handleRunTriage = async () => {
    if (autoTriage) {
      setAutoTriage(false);
      return;
    }
    setAutoTriage(true);
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

  if (loading && !useSeeded) return <InboxSkeleton />;

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
      {/* ── Unified Toolbar: stats left, actions right ── */}
      <div className="bb-inbox-toolbar">
        <div className="bb-inbox-stats">
          <StatPill value={unreadCount} label="unread" active={unreadCount > 0} />
          <span className="bb-inbox-stats__sep" />
          <StatPill value={actionableCount} label="action needed" active={actionableCount > 0} />
          <span className="bb-inbox-stats__sep" />
          <StatPill value={waitingCount} label="needs reply" active={waitingCount > 0} />
          <span className="bb-inbox-stats__sep" />
          <StatPill value={totalCount} label="total" />
        </div>

        <div className="bb-inbox-toolbar__actions">
          {newMessageAlert && (
            <button
              onClick={() => setNewMessageAlert(false)}
              className="bb-btn bb-btn--ghost bb-btn--sm"
              style={{ color: 'var(--bb-green)' }}
            >
              <span className="bb-inbox-pulse" />
              New messages
            </button>
          )}
          {hasActiveFilters && (
            <button onClick={clearFilters} className="bb-btn bb-btn--ghost bb-btn--sm">
              <X size={12} />
              Clear
            </button>
          )}
          <button
            onClick={() => setShowFilters(f => !f)}
            className="bb-btn bb-btn--ghost"
            data-active={showFilters || undefined}
          >
            <Filter size={14} />
            Filters
            <ChevronDown
              size={11}
              style={{
                transform: showFilters ? 'rotate(180deg)' : 'none',
                transition: 'transform var(--duration-fast) var(--ease-default)',
              }}
            />
          </button>
          <button
            onClick={handleRunTriage}
            disabled={refreshing && !autoTriage}
            className={`bb-btn ${autoTriage ? 'bb-btn--accent' : 'bb-btn--ghost'}`}
            aria-pressed={autoTriage}
          >
            {refreshing && !autoTriage ? (
              <><RefreshCw size={14} className="animate-spin" /> Triaging...</>
            ) : (
              <><Sparkles size={14} /> Auto-triage {autoTriage ? 'On' : ''}</>
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
// Inbox Skeleton — mirrors toolbar + message row layout
// ---------------------------------------------------------------------------

const shimmer: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--border-subtle) 25%, var(--hover-bg) 50%, var(--border-subtle) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease-in-out infinite',
  borderRadius: 6,
};

function InboxSkeleton() {
  return (
    <TabShell>
      <div aria-busy="true" role="status" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Toolbar skeleton: stat pills left, buttons right */}
        <div className="bb-inbox-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {[80, 100, 90, 60].map((w, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="bb-inbox-stats__sep" />}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <div style={{ ...shimmer, width: 24, height: 20 }} />
                  <div style={{ ...shimmer, width: w - 24, height: 12 }} />
                </div>
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ ...shimmer, width: 72, height: 32, borderRadius: 8 }} />
            <div style={{ ...shimmer, width: 96, height: 32, borderRadius: 8 }} />
          </div>
        </div>

        {/* Message row skeletons */}
        <div className="bb-inbox-list">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bb-inbox-row"
              style={{ opacity: 1 - i * 0.1 }}
            >
              {/* Col 1: icon + sender */}
              <div className="bb-inbox-row__col1">
                <div style={{ ...shimmer, width: 28, height: 28, borderRadius: 8 }} />
                <div style={{ ...shimmer, width: 80 + (i % 3) * 20, height: 13 }} />
              </div>
              {/* Col 2: tag + subject + preview */}
              <div className="bb-inbox-row__col2" style={{ gap: 8 }}>
                <div style={{ ...shimmer, width: 56, height: 18, borderRadius: 10 }} />
                <div style={{ ...shimmer, width: 140 + (i % 4) * 30, height: 13 }} />
                <div style={{ ...shimmer, width: 200 + (i % 3) * 40, height: 11 }} />
              </div>
              {/* Time */}
              <div className="bb-inbox-row__meta">
                <div style={{ ...shimmer, width: 24, height: 12 }} />
              </div>
            </div>
          ))}
        </div>
        <span className="sr-only">Loading inbox...</span>
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
  const ChannelIcon = CHANNEL_ICONS[message.channelType] || GmailIcon;
  const brandColor = CHANNEL_BRAND_COLORS[message.channelType] || 'var(--text-dim)';
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
      style={{ '--channel-color': brandColor } as React.CSSProperties}
    >
      {/* Col 1: Channel icon + sender name */}
      <div className="bb-inbox-row__col1">
        <div className="bb-inbox-row__icon">
          <ChannelIcon size={15} />
        </div>
        <span className="bb-inbox-row__sender">{sender}</span>
      </div>

      {/* Col 2: Tag + subject + preview, all aligned */}
      <div className="bb-inbox-row__col2">
        <span className={`bb-inbox-row__tag bb-inbox-row__tag--${message.category}`}>
          {message.category}
        </span>
        {message.subject && (
          <span className="bb-inbox-row__subject">{message.subject}</span>
        )}
        <span className="bb-inbox-row__preview">{message.bodyPreview}</span>
      </div>

      {/* Right side: time + hover actions crossfade */}
      <div className="bb-inbox-row__meta">
        <div className="bb-inbox-row__meta-default">
          <span className="bb-inbox-row__time">{timeAgo}</span>
        </div>
        <div className="bb-inbox-row__hover-actions">
          <button className="bb-inbox-row__action" title="Archive" aria-label="Archive message">
            <Archive size={14} />
          </button>
          <button className="bb-inbox-row__action" title="Done" aria-label="Mark as done">
            <CheckCircle2 size={14} />
          </button>
        </div>
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
