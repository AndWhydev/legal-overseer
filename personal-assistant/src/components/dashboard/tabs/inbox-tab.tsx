'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { useDevOverrides } from '@/lib/dev/dev-overrides';
import { TabShell } from '@/components/ui/tab-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { logger } from '@/lib/core/logger';
import { createClient } from '@/lib/supabase/client';
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
  Reply,
  Forward,
  AlertTriangle,
} from 'lucide-react';
import { resolveAvatar, resolveAvatarSync, type AvatarResult } from '@/lib/avatar/resolver';

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

  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

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

  const handleArchive = useCallback(async (id: string) => {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from('channel_messages').delete().eq('id', id);
    setMessages(prev => prev.filter(m => m.id !== id));
    setTotal(prev => prev - 1);
  }, []);

  const handleDone = useCallback(async (id: string) => {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from('channel_messages').update({ processed: true }).eq('id', id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'processed' } : m));
  }, []);

  // Bulk actions on selected messages
  const handleBulkArchive = useCallback(() => {
    selectedIds.forEach(id => handleArchive(id));
    clearSelection();
  }, [selectedIds, handleArchive, clearSelection]);

  const handleBulkDone = useCallback(() => {
    selectedIds.forEach(id => handleDone(id));
    clearSelection();
  }, [selectedIds, handleDone, clearSelection]);

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

  // ── Global keyboard shortcuts (j/k navigate, Enter opens, e archive, d done, x select) ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when drawer is open (drawer has its own handlers) or typing in an input
      if (selectedMessage) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'j': // Next message
          e.preventDefault();
          setFocusedIndex(prev => Math.min(prev + 1, displayed.length - 1));
          break;
        case 'k': // Previous message
          e.preventDefault();
          setFocusedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter': // Open focused message
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < displayed.length) {
            setSelectedMessage(displayed[focusedIndex]);
          }
          break;
        case 'e': // Archive focused message
          if (focusedIndex >= 0 && focusedIndex < displayed.length) {
            e.preventDefault();
            handleArchive(displayed[focusedIndex].id);
          }
          break;
        case 'd': // Done focused message
          if (focusedIndex >= 0 && focusedIndex < displayed.length) {
            e.preventDefault();
            handleDone(displayed[focusedIndex].id);
          }
          break;
        case 'x': // Toggle select focused message
          if (focusedIndex >= 0 && focusedIndex < displayed.length) {
            e.preventDefault();
            toggleSelect(displayed[focusedIndex].id);
          }
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedMessage, displayed, focusedIndex, handleArchive, handleDone, toggleSelect]);

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

      {/* ── Bulk Action Bar ── */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          background: 'rgba(255, 90, 31, 0.08)',
          borderRadius: 8,
          margin: '0 0 4px',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }}>
            {selectedIds.size} selected
          </span>
          <button className="bb-btn bb-btn--ghost bb-btn--sm" onClick={handleBulkArchive}>
            <Archive size={13} /> Archive
          </button>
          <button className="bb-btn bb-btn--ghost bb-btn--sm" onClick={handleBulkDone}>
            <CheckCircle2 size={13} /> Done
          </button>
          <button className="bb-btn bb-btn--ghost bb-btn--sm" onClick={clearSelection}>
            <X size={12} /> Clear
          </button>
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
          displayed.map((msg, idx) => (
            <MessageRow
              key={msg.id}
              message={msg}
              onArchive={handleArchive}
              onDone={handleDone}
              onClick={() => setSelectedMessage(msg)}
              focused={idx === focusedIndex}
              selected={selectedIds.has(msg.id)}
              onToggleSelect={() => toggleSelect(msg.id)}
            />
          ))
        )}
      </div>

      {/* ── Email Reading Drawer ── */}
      <EmailDrawer
        message={selectedMessage}
        onClose={() => setSelectedMessage(null)}
        onArchive={(id) => { handleArchive(id); setSelectedMessage(null); }}
        onDone={(id) => { handleDone(id); setSelectedMessage(null); }}
      />
    </TabShell>
  );
}

// ---------------------------------------------------------------------------
// Email Reading Drawer — slide-in panel from right
// ---------------------------------------------------------------------------

const drawerOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  background: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(4px)',
  transition: 'opacity 0.25s ease',
};

const drawerPanelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: '60vw',
  maxWidth: 800,
  minWidth: 400,
  zIndex: 51,
  background: 'rgba(20, 20, 22, 0.95)',
  backdropFilter: 'blur(20px)',
  borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  boxShadow: '-8px 0 40px rgba(0, 0, 0, 0.4)',
};

const drawerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 24px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  flexShrink: 0,
};

const drawerActionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255, 255, 255, 0.08)',
  background: 'rgba(255, 255, 255, 0.04)',
  color: 'rgba(255, 255, 255, 0.7)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const drawerCloseBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 8,
  border: 'none',
  background: 'rgba(255, 255, 255, 0.06)',
  color: 'rgba(255, 255, 255, 0.6)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  flexShrink: 0,
};

const drawerMetaStyle: React.CSSProperties = {
  padding: '20px 24px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  flexShrink: 0,
};

const drawerBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '24px',
  color: 'rgba(255, 255, 255, 0.85)',
  fontSize: 14,
  lineHeight: 1.7,
};

function EmailDrawer({
  message,
  onClose,
  onArchive,
  onDone,
}: {
  message: InboxMessage | null;
  onClose: () => void;
  onArchive: (id: string) => void;
  onDone: (id: string) => void;
}) {
  const isOpen = message !== null;

  useEffect(() => {
    if (!isOpen || !message) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key) {
        case 'Escape': onClose(); break;
        case 'e': e.preventDefault(); onArchive(message.id); break;
        case 'd': e.preventDefault(); onDone(message.id); break;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, message, onClose, onArchive, onDone]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sender = message.contactName || message.senderName || message.senderEmail || 'Unknown';
  const ChannelIcon = CHANNEL_ICONS[message.channelType] || GmailIcon;
  const brandColor = CHANNEL_BRAND_COLORS[message.channelType] || 'var(--text-dim)';
  const formattedDate = new Date(message.receivedAt).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      {/* Overlay */}
      <div
        style={drawerOverlayStyle}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label={`Reading: ${message.subject || 'Message'}`}
        aria-modal="true"
        style={drawerPanelStyle}
      >
        {/* Header: actions + close */}
        <div style={drawerHeaderStyle}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              style={drawerActionBtnStyle}
              onClick={() => {/* TODO: reply */}}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
              title="Reply (R)"
            >
              <Reply size={13} /> Reply
            </button>
            <button
              style={drawerActionBtnStyle}
              onClick={() => {/* TODO: forward */}}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
              title="Forward (F)"
            >
              <Forward size={13} /> Forward
            </button>
            <button
              style={drawerActionBtnStyle}
              onClick={() => onArchive(message.id)}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
              title="Archive (E)"
            >
              <Archive size={13} /> Archive
            </button>
            <button
              style={drawerActionBtnStyle}
              onClick={() => onDone(message.id)}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
              title="Done (D)"
            >
              <CheckCircle2 size={13} /> Done
            </button>
            <button
              style={{ ...drawerActionBtnStyle, color: 'rgba(239, 68, 68, 0.8)' }}
              onClick={() => {/* TODO: spam */}}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
              title="Spam (!)"
            >
              <AlertTriangle size={13} /> Spam
            </button>
          </div>
          <button
            style={drawerCloseBtnStyle}
            onClick={onClose}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
            aria-label="Close drawer"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Meta: sender, subject, time */}
        <div style={drawerMetaStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `${brandColor}18`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: brandColor,
              flexShrink: 0,
            }}>
              <ChannelIcon size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.95)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {sender}
              </div>
              {message.senderEmail && (
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', marginTop: 1 }}>
                  {message.senderEmail}
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.35)', flexShrink: 0, textAlign: 'right' }}>
              {formattedDate}
            </div>
          </div>

          {message.subject && (
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255, 255, 255, 0.95)', margin: 0, lineHeight: 1.3 }}>
              {message.subject}
            </h2>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <span style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: message.category === 'actionable' ? 'rgba(255, 90, 31, 0.15)' :
                          message.category === 'personal' ? 'rgba(139, 92, 246, 0.15)' :
                          message.category === 'spam' ? 'rgba(239, 68, 68, 0.15)' :
                          'rgba(255, 255, 255, 0.06)',
              color: message.category === 'actionable' ? '#FF7A45' :
                     message.category === 'personal' ? '#A78BFA' :
                     message.category === 'spam' ? '#F87171' :
                     'rgba(255, 255, 255, 0.5)',
            }}>
              {getCategoryLabel(message.category)}
            </span>
            {message.threadStatus && (
              <span style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 500,
                background: message.threadStatus === 'waiting_on_you' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.06)',
                color: message.threadStatus === 'waiting_on_you' ? '#60A5FA' : 'rgba(255, 255, 255, 0.4)',
              }}>
                {message.threadStatus === 'waiting_on_you' ? 'Waiting on you' :
                 message.threadStatus === 'waiting_on_them' ? 'Waiting on them' :
                 message.threadStatus === 'new' ? 'New' : 'Resolved'}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={drawerBodyStyle}>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
            {message.bodyPreview}
          </div>
        </div>

        {/* Footer keyboard hints */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}>
          {['Esc close', 'R reply', 'E archive', 'D done'].map((hint) => {
            const [key, ...rest] = hint.split(' ');
            return (
              <span key={key} style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.25)' }}>
                <kbd style={{
                  padding: '2px 5px',
                  borderRadius: 4,
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  fontSize: 10,
                  fontFamily: 'inherit',
                }}>{key}</kbd>{' '}{rest.join(' ')}
              </span>
            );
          })}
        </div>
      </div>
    </>
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

function MessageRow({ message, onArchive, onDone, onClick, focused, selected, onToggleSelect }: { message: InboxMessage; onArchive?: (id: string) => void; onDone?: (id: string) => void; onClick?: () => void; focused?: boolean; selected?: boolean; onToggleSelect?: () => void }) {
  const ChannelIcon = CHANNEL_ICONS[message.channelType] || GmailIcon;
  const brandColor = CHANNEL_BRAND_COLORS[message.channelType] || 'var(--text-dim)';
  const isUnread = message.status === 'unread';
  const isImportant = message.significance >= 7;
  const timeAgo = formatTimeAgo(message.receivedAt);
  const sender = message.contactName || message.senderName || message.senderEmail || 'Unknown';

  const level = message.significance >= 8 ? 'critical' :
    message.significance >= 6 ? 'high' :
    message.significance >= 5 ? 'medium' : undefined;

  // Avatar resolution — sync initial render, async upgrade
  const email = message.senderEmail;
  const syncAvatar = email ? resolveAvatarSync(email, sender) : null;
  const [avatar, setAvatar] = useState<AvatarResult | null>(syncAvatar);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    resolveAvatar(email, sender).then((result) => {
      if (!cancelled) setAvatar(result);
    });
    return () => { cancelled = true; };
  }, [email, sender]);

  return (
    <div
      className="bb-inbox-row"
      data-unread={isUnread || undefined}
      data-important={isImportant || undefined}
      data-level={level}
      data-focused={focused || undefined}
      data-selected={selected || undefined}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      style={{
        '--channel-color': brandColor,
        cursor: 'pointer',
        ...(focused ? { background: 'rgba(255, 255, 255, 0.04)', outline: '1px solid rgba(255, 255, 255, 0.1)' } : {}),
        ...(selected ? { background: 'rgba(255, 90, 31, 0.06)' } : {}),
      } as React.CSSProperties}
    >
      {/* Selection checkbox */}
      <div
        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: `1.5px solid ${selected ? '#FF5A1F' : 'rgba(255, 255, 255, 0.15)'}`,
          background: selected ? 'rgba(255, 90, 31, 0.2)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        {selected && <CheckCircle2 size={12} style={{ color: '#FF5A1F' }} />}
      </div>

      {/* Col 1: Avatar (with channel badge) + sender name */}
      <div className="bb-inbox-row__col1">
        <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
          {avatar ? (
            <img
              src={avatar.url}
              alt={sender}
              width={32}
              height={32}
              style={{
                borderRadius: '50%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : (
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-secondary)',
              }}
            >
              {sender[0]?.toUpperCase() || '?'}
            </div>
          )}
          {/* Channel badge — small icon overlaid bottom-right */}
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'var(--card-bg, #1a1a2e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: brandColor,
            }}
          >
            <ChannelIcon size={9} />
          </div>
        </div>
        <span className="bb-inbox-row__sender">{sender}</span>
      </div>

      {/* Col 2: Tag + subject + preview, all aligned */}
      <div className="bb-inbox-row__col2">
        <span className={`bb-inbox-row__tag bb-inbox-row__tag--${message.category}`}>
          {getCategoryLabel(message.category)}
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
          <button className="bb-inbox-row__action" title="Archive" aria-label="Archive message" onClick={(e) => { e.stopPropagation(); onArchive?.(message.id); }}>
            <Archive size={14} />
          </button>
          <button className="bb-inbox-row__action" title="Done" aria-label="Mark as done" onClick={(e) => { e.stopPropagation(); onDone?.(message.id); }}>
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

/**
 * Map raw category to user-friendly label
 */
function getCategoryLabel(category: MessageCategory): string {
  const labels: Record<MessageCategory, string> = {
    actionable: 'Priority',
    personal: 'Personal',
    informational: 'Updates',
    spam: 'Spam',
  };
  return labels[category] || category;
}

export default React.memo(InboxTab);
