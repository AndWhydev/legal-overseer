'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { useDevOverrides } from '@/lib/dev/dev-overrides';
import { useInboxKeyboard } from '@/hooks/use-inbox-keyboard';
import { InboxShortcutsOverlay } from '@/components/dashboard/inbox-shortcuts-overlay';
import { TabShell } from '@/components/ui/tab-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { logger } from '@/lib/core/logger';
import { createClient } from '@/lib/supabase/client';
import InboxDrawer, { type ThreadMessageItem } from '@/components/dashboard/inbox-drawer';
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
  AlertTriangle,
  Star,
} from 'lucide-react';
import { resolveAvatar, resolveAvatarSync, type AvatarResult } from '@/lib/avatar/resolver';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MessageCategory = 'actionable' | 'informational' | 'spam' | 'personal';
type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';
type ThreadStatus = 'waiting_on_you' | 'waiting_on_them' | 'resolved' | 'new';
type CategoryPillType = 'all' | 'priority' | 'updates' | 'feed' | 'receipts';

interface InboxMessage {
  id: string;
  channelType: string;
  senderName: string | null;
  senderEmail: string | null;
  subject: string | null;
  bodyPreview: string;
  aiSummary: string | null;
  category: MessageCategory;
  priority: PriorityLevel;
  significance: number;
  contactId: string | null;
  contactName: string | null;
  threadStatus: ThreadStatus | null;
  threadCount?: number;
  deduplicatedWith: string | null;
  receivedAt: string;
  processedAt: string | null;
  status: string;
}

interface ToastEntry {
  id: string;
  message: string;
  undo: () => void;
}

// ---------------------------------------------------------------------------
// Category Pill Config
// ---------------------------------------------------------------------------

const PILL_CONFIG: Record<CategoryPillType, {
  label: string;
  filter: (m: InboxMessage) => boolean;
}> = {
  all:      { label: 'All',      filter: (m) => m.category !== 'spam' },
  priority: { label: 'Priority', filter: (m) => m.category === 'actionable' },
  updates:  { label: 'Updates',  filter: (m) => m.category === 'informational' },
  feed:     { label: 'Feed',     filter: (m) => m.category === 'personal' },
  receipts: { label: 'Receipts', filter: (m) => m.channelType === 'stripe' || m.channelType === 'xero' },
};

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SEED_MESSAGES: InboxMessage[] = [
  {
    id: 's1', channelType: 'gmail', senderName: 'Sarah Chen', senderEmail: 'sarah@designstudio.co',
    subject: 'Website revision — final round feedback', bodyPreview: 'Hey, the client loved the new hero section but wants the CTA button colour changed to match their brand guide...',
    aiSummary: 'Client approved hero section but wants CTA button colour updated to match brand guide. Action needed before presentation.',
    category: 'actionable', priority: 'high', significance: 8, contactId: 'c1', contactName: 'Sarah Chen',
    threadStatus: 'waiting_on_you', deduplicatedWith: null, threadCount: 3,
    receivedAt: new Date(Date.now() - 12 * 60000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  {
    id: 's2', channelType: 'whatsapp', senderName: 'Andy Wu', senderEmail: null,
    subject: null, bodyPreview: 'Can you check the Sentry dashboard? Getting a spike in 500s on the checkout flow since the last deploy',
    aiSummary: 'Checkout flow seeing 500 error spike post-deploy. Needs immediate Sentry investigation.',
    category: 'actionable', priority: 'critical', significance: 9, contactId: 'c2', contactName: 'Andy Wu',
    threadStatus: 'waiting_on_you', deduplicatedWith: null, threadCount: 2,
    receivedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  {
    id: 's3', channelType: 'asana', senderName: 'Asana', senderEmail: 'notifications@asana.com',
    subject: 'Task assigned: Q1 brand refresh deliverables', bodyPreview: 'You have been assigned to "Q1 brand refresh deliverables" in project Brand & Identity. Due: Mar 7',
    aiSummary: 'Assigned to Q1 brand refresh deliverables in Brand & Identity project. Due March 7.',
    category: 'actionable', priority: 'medium', significance: 6, contactId: null, contactName: null,
    threadStatus: 'new', deduplicatedWith: null,
    receivedAt: new Date(Date.now() - 45 * 60000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  {
    id: 's4', channelType: 'stripe', senderName: 'Stripe', senderEmail: 'notifications@stripe.com',
    subject: 'Payment received — $4,200.00', bodyPreview: 'Invoice INV-2024-0089 for DesignStudio Co has been paid. Amount: $4,200.00 AUD',
    aiSummary: 'DesignStudio Co paid $4,200 AUD for invoice INV-2024-0089.',
    category: 'informational', priority: 'low', significance: 4, contactId: 'c1', contactName: 'Sarah Chen',
    threadStatus: null, deduplicatedWith: null,
    receivedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  {
    id: 's5', channelType: 'gmail', senderName: 'Tom Bradley', senderEmail: 'tom@acmecorp.com',
    subject: 'Re: Proposal for Q2 retainer', bodyPreview: "Thanks for sending that through. I've shared it with our CFO. Expecting a decision by end of week.",
    aiSummary: 'Q2 retainer proposal shared with CFO. Decision expected by end of week. No action needed yet.',
    category: 'informational', priority: 'medium', significance: 5, contactId: 'c3', contactName: 'Tom Bradley',
    threadStatus: 'waiting_on_them', deduplicatedWith: null, threadCount: 4,
    receivedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'actioned',
  },
  {
    id: 's6', channelType: 'calendly', senderName: 'Calendly', senderEmail: 'notifications@calendly.com',
    subject: 'New booking: Discovery call with Mira Patel', bodyPreview: 'Mira Patel booked a 30-min discovery call for tomorrow at 10:00 AM AEST',
    aiSummary: 'Mira Patel booked a 30-min discovery call for tomorrow at 10 AM AEST.',
    category: 'informational', priority: 'medium', significance: 5, contactId: null, contactName: 'Mira Patel',
    threadStatus: 'new', deduplicatedWith: null,
    receivedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'actioned',
  },
  {
    id: 's7', channelType: 'gmail', senderName: 'LinkedIn', senderEmail: 'notifications@linkedin.com',
    subject: '3 people viewed your profile', bodyPreview: 'Your profile was viewed by a Product Manager at Canva, a Design Lead at Atlassian, and 1 other',
    aiSummary: 'LinkedIn notification — 3 profile views including Canva PM and Atlassian Design Lead.',
    category: 'spam', priority: 'low', significance: 1, contactId: null, contactName: null,
    threadStatus: null, deduplicatedWith: null,
    receivedAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'archived',
  },
  {
    id: 's8', channelType: 'whatsapp', senderName: 'Jess Reilly', senderEmail: null,
    subject: null, bodyPreview: 'Lunch tomorrow? That new ramen place on Crown St just opened',
    aiSummary: 'Lunch invite for tomorrow at new ramen place on Crown St.',
    category: 'personal', priority: 'low', significance: 3, contactId: 'c4', contactName: 'Jess Reilly',
    threadStatus: 'waiting_on_you', deduplicatedWith: null,
    receivedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
];

const SEED_THREAD_MESSAGES: Record<string, ThreadMessageItem[]> = {
  s1: [
    { id: 's1-1', senderName: 'Sarah Chen', receivedAt: new Date(Date.now() - 5 * 86400000).toISOString(), bodyPreview: 'Hi, wanted to check in on the website redesign. How\'s the progress looking? The client presentation is next week.', isLatest: false },
    { id: 's1-2', senderName: 'You', receivedAt: new Date(Date.now() - 4 * 86400000).toISOString(), bodyPreview: 'Going really well! I\'ll have the hero section and navigation ready by Friday for your review.', isSelf: true, isLatest: false },
    { id: 's1-3', senderName: 'Sarah Chen', receivedAt: new Date(Date.now() - 12 * 60000).toISOString(), bodyPreview: 'Hey, the client loved the new hero section but wants the CTA button colour changed to match their brand guide...', isLatest: true },
  ],
  s2: [
    { id: 's2-1', senderName: 'Andy Wu', receivedAt: new Date(Date.now() - 20 * 60000).toISOString(), bodyPreview: 'Heads up — seeing some unusual latency on the dashboard API. Might be related to the deploy.', isLatest: false },
    { id: 's2-2', senderName: 'Andy Wu', receivedAt: new Date(Date.now() - 5 * 60000).toISOString(), bodyPreview: 'Can you check the Sentry dashboard? Getting a spike in 500s on the checkout flow since the last deploy', isLatest: true },
  ],
  s5: [
    { id: 's5-1', senderName: 'You', receivedAt: new Date(Date.now() - 10 * 86400000).toISOString(), bodyPreview: 'Hi Tom, please find our Q2 retainer proposal attached. We\'ve kept the scope tight based on our last discussion.', isSelf: true, isLatest: false },
    { id: 's5-2', senderName: 'Tom Bradley', receivedAt: new Date(Date.now() - 9 * 86400000).toISOString(), bodyPreview: 'Thanks for sending through, we\'ll review internally and come back to you.', isLatest: false },
    { id: 's5-3', senderName: 'Tom Bradley', receivedAt: new Date(Date.now() - 3 * 86400000).toISOString(), bodyPreview: 'Quick update — CFO is reviewing. Should have an answer by end of week.', isLatest: false },
    { id: 's5-4', senderName: 'Tom Bradley', receivedAt: new Date(Date.now() - 4 * 3600000).toISOString(), bodyPreview: "Thanks for sending that through. I've shared it with our CFO. Expecting a decision by end of week.", isLatest: true },
  ],
};

// ---------------------------------------------------------------------------
// Snooze time options
// ---------------------------------------------------------------------------

function getSnoozeOptions(): { label: string; sublabel: string; value: string }[] {
  const now = new Date();

  const laterToday = new Date(now);
  laterToday.setHours(Math.max(now.getHours() + 3, 18), 0, 0, 0);

  const tomorrowAM = new Date(now);
  tomorrowAM.setDate(tomorrowAM.getDate() + 1);
  tomorrowAM.setHours(9, 0, 0, 0);

  const tomorrowPM = new Date(now);
  tomorrowPM.setDate(tomorrowPM.getDate() + 1);
  tomorrowPM.setHours(14, 0, 0, 0);

  const nextMonday = new Date(now);
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 0, 0, 0);

  return [
    { label: 'Later today', sublabel: laterToday.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }), value: laterToday.toISOString() },
    { label: 'Tomorrow morning', sublabel: '9:00 AM', value: tomorrowAM.toISOString() },
    { label: 'Tomorrow afternoon', sublabel: '2:00 PM', value: tomorrowPM.toISOString() },
    { label: 'Next week', sublabel: 'Mon 9:00 AM', value: nextMonday.toISOString() },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function InboxTab() {
  // ── State ──
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null);
  const [newMessageAlert, setNewMessageAlert] = useState(false);

  // New state for P2-5, P2-2, P4-5
  const [activePill, setActivePill] = useState<CategoryPillType>('all');
  const [undoToasts, setUndoToasts] = useState<ToastEntry[]>([]);
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [snoozeAnchor, setSnoozeAnchor] = useState<{ top: number; right: number } | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());
  const [showAiBrief, setShowAiBrief] = useState(false);
  const aiBriefRef = useRef<HTMLDivElement>(null);

  const devOverrides = useDevOverrides();
  const useSeeded = devOverrides?.seed_data?.inbox ?? false;

  // ── Computed: displayed — defined early so callbacks can reference it ──
  const displayed = useMemo(() => {
    return messages.filter(m => {
      if (snoozedIds.has(m.id)) return false;
      if (channelFilter && m.channelType !== channelFilter) return false;
      if (priorityFilter && m.priority !== priorityFilter) return false;
      if (statusFilter && m.status !== statusFilter) return false;
      const pillFilter = PILL_CONFIG[activePill]?.filter;
      if (pillFilter && !pillFilter(m)) return false;
      return true;
    });
  }, [messages, channelFilter, priorityFilter, statusFilter, activePill, snoozedIds]);

  const pillCounts = useMemo(() => {
    const counts: Record<CategoryPillType, number> = { all: 0, priority: 0, updates: 0, feed: 0, receipts: 0 };
    const nonSnooze = messages.filter(m => !snoozedIds.has(m.id));
    for (const m of nonSnooze) {
      for (const [key, cfg] of Object.entries(PILL_CONFIG) as [CategoryPillType, typeof PILL_CONFIG[CategoryPillType]][]) {
        if (cfg.filter(m)) counts[key]++;
      }
    }
    return counts;
  }, [messages, snoozedIds]);

  const hasUnreadPriority = useMemo(
    () => messages.some(m => m.category === 'actionable' && m.status === 'unread' && !snoozedIds.has(m.id)),
    [messages, snoozedIds]
  );

  // ── Fetch ──
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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

  useRealtimeSubscription('channel_messages', { event: 'INSERT' }, () => {
    setNewMessageAlert(true);
    if (!useSeeded) fetchInbox(true);
  });

  // Close snooze picker when clicking outside
  useEffect(() => {
    if (!snoozeTargetId) return;
    const handler = (e: MouseEvent) => {
      if (snoozeAnchor && !(e.target as Element).closest('[data-snooze-picker]')) {
        setSnoozeTargetId(null);
        setSnoozeAnchor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [snoozeTargetId, snoozeAnchor]);

  // Close AI brief when clicking outside
  useEffect(() => {
    if (!showAiBrief) return;
    const handler = (e: MouseEvent) => {
      if (!aiBriefRef.current?.contains(e.target as Node)) {
        setShowAiBrief(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAiBrief]);

  // ── Toast system ──
  const addToast = useCallback((message: string, undo: () => void) => {
    const id = Math.random().toString(36).slice(2);
    setUndoToasts(prev => [...prev.slice(-2), { id, message, undo }]);
    setTimeout(() => setUndoToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  // ── Handlers ──
  const handleArchive = useCallback(async (id: string) => {
    const original = messages.find(m => m.id === id);
    setMessages(prev => prev.filter(m => m.id !== id));
    setTotal(prev => prev - 1);
    if (original) {
      addToast('Message archived', () => {
        setMessages(prev => [original, ...prev]);
        setTotal(prev => prev + 1);
      });
    }
    const supabase = createClient();
    if (supabase) {
      await supabase.from('channel_messages')
        .update({ metadata: { status: 'archived' } as Record<string, unknown> })
        .eq('id', id);
    }
  }, [messages, addToast]);

  const handleDone = useCallback(async (id: string) => {
    const supabase = createClient();
    if (supabase) {
      await supabase.from('channel_messages').update({ processed: true } as Record<string, unknown>).eq('id', id);
    }
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'processed' } : m));
    addToast('Marked as done', () => {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'unread' } : m));
    });
  }, [addToast]);

  const handleSnooze = useCallback((id: string, snoozedUntil: string) => {
    setSnoozedIds(prev => new Set([...prev, id]));
    setSnoozeTargetId(null);
    setSnoozeAnchor(null);
    addToast('Message snoozed', () => {
      setSnoozedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    });
    const supabase = createClient();
    supabase?.from('channel_messages')
      .update({ metadata: { snoozed_until: snoozedUntil } as Record<string, unknown> })
      .eq('id', id);
  }, [addToast]);

  const handleStar = useCallback((id: string) => {
    setStarredIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }, []);

  const handleSpam = useCallback(async (id: string) => {
    const original = messages.find(m => m.id === id);
    setMessages(prev => prev.filter(m => m.id !== id));
    setTotal(prev => prev - 1);
    if (original) {
      addToast('Marked as spam', () => {
        setMessages(prev => [original, ...prev]);
        setTotal(prev => prev + 1);
      });
    }
    const supabase = createClient();
    if (supabase) {
      await supabase.from('channel_messages')
        .update({ metadata: { status: 'spam' } as Record<string, unknown> })
        .eq('id', id);
    }
  }, [messages, addToast]);

  const handleDelete = useCallback(async (id: string) => {
    const msg = messages.find(m => m.id === id);
    if (msg) {
      const ageHours = (Date.now() - new Date(msg.receivedAt).getTime()) / 3600000;
      if (ageHours < 24 && !confirm('Permanently delete this message?')) return;
    }
    setMessages(prev => prev.filter(m => m.id !== id));
    setTotal(prev => prev - 1);
    const supabase = createClient();
    if (supabase) await supabase.from('channel_messages').delete().eq('id', id);
  }, [messages]);

  const handleReply = useCallback(async (id: string, body: string) => {
    logger.info('[inbox-tab] reply handler called', { id, bodyLength: body.length });
  }, []);

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    if (!selectedMessage) return;
    const currentIndex = displayed.findIndex(m => m.id === selectedMessage.id);
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= 0 && nextIndex < displayed.length) {
      setSelectedMessage(displayed[nextIndex]);
    }
  }, [selectedMessage, displayed]);

  // ── Keyboard hook ──
  const keyboard = useInboxKeyboard({
    enabled: !selectedMessage,
    messageCount: displayed.length,
    isDrawerOpen: selectedMessage !== null,
    onOpen: (index) => {
      if (index >= 0 && index < displayed.length) setSelectedMessage(displayed[index]);
    },
    onArchive: (index) => {
      if (index >= 0 && index < displayed.length) handleArchive(displayed[index].id);
    },
    onDone: (index) => {
      if (index >= 0 && index < displayed.length) handleDone(displayed[index].id);
    },
    onReply: () => {},
    onForward: () => {},
    onSnooze: () => {},
    onStar: () => {},
    onDelete: (index) => {
      if (index >= 0 && index < displayed.length) handleDelete(displayed[index].id);
    },
    onSpam: () => {},
    onSelect: (index) => {
      if (index >= 0 && index < displayed.length) toggleSelect(displayed[index].id);
    },
    onSelectAll: () => {
      keyboard.setSelectedIds(new Set(displayed.map(m => m.id)));
    },
    onDeselectAll: () => keyboard.setSelectedIds(new Set()),
    onCategorySwitch: () => {},
    onSearch: () => {},
    onClose: () => {
      setSelectedMessage(null);
      keyboard.setSelectedIndex(-1);
    },
  });

  const toggleSelect = useCallback((id: string) => {
    keyboard.setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [keyboard]);

  const clearSelection = useCallback(() => keyboard.setSelectedIds(new Set()), [keyboard]);

  const handleBulkArchive = useCallback(() => {
    keyboard.selectedIds.forEach(id => handleArchive(id));
    clearSelection();
  }, [keyboard.selectedIds, handleArchive, clearSelection]);

  const handleBulkDone = useCallback(() => {
    keyboard.selectedIds.forEach(id => handleDone(id));
    clearSelection();
  }, [keyboard.selectedIds, handleDone, clearSelection]);

  const hasActiveFilters = channelFilter || priorityFilter || statusFilter;
  const clearFilters = () => { setChannelFilter(''); setPriorityFilter(''); setStatusFilter(''); };

  if (loading && !useSeeded) return <InboxSkeleton />;

  if (error && messages.length === 0) {
    return (
      <TabShell>
        <div className="bb-tab-error">
          <p className="bb-tab-error__text">{error}</p>
          <button className="bb-btn bb-btn--ghost bb-btn--sm" onClick={() => fetchInbox()}>Retry</button>
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
      {/* ── Toolbar ── */}
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
            <button onClick={() => setNewMessageAlert(false)} className="bb-btn bb-btn--ghost bb-btn--sm" style={{ color: 'var(--bb-green)' }}>
              <span className="bb-inbox-pulse" />
              New messages
            </button>
          )}
          {hasActiveFilters && (
            <button onClick={clearFilters} className="bb-btn bb-btn--ghost bb-btn--sm">
              <X size={12} /> Clear
            </button>
          )}

          {/* AI Brief button — Task #18 */}
          <div ref={aiBriefRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowAiBrief(v => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                border: showAiBrief ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: showAiBrief ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
                color: showAiBrief ? '#A78BFA' : 'rgba(255,255,255,0.7)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              <Sparkles size={13} /> AI Brief
            </button>

            {showAiBrief && (
              <AiBriefPanel
                messages={displayed}
                onArchiveAll={(category) => {
                  const targets = displayed.filter(PILL_CONFIG[category].filter);
                  targets.forEach(m => handleArchive(m.id));
                  setShowAiBrief(false);
                }}
                onFilterTo={(pill) => { setActivePill(pill); setShowAiBrief(false); }}
              />
            )}
          </div>

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
        </div>
      </div>

      {/* ── Category Pills Bar — Task #10 ── */}
      <CategoryPillsBar
        activePill={activePill}
        onSelect={setActivePill}
        counts={pillCounts}
        hasUnreadPriority={hasUnreadPriority}
      />

      {/* ── Filter Drawer ── */}
      {showFilters && (
        <div className="bb-inbox-filters">
          <InboxSelect value={channelFilter} onChange={setChannelFilter} label="Channel"
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
          <InboxSelect value={priorityFilter} onChange={setPriorityFilter} label="Priority"
            options={[
              { value: '', label: 'All Priorities' },
              { value: 'critical', label: 'Critical' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
          />
          <InboxSelect value={statusFilter} onChange={setStatusFilter} label="Status"
            options={[
              { value: '', label: 'All Status' },
              { value: 'unread', label: 'Unread' },
              { value: 'actioned', label: 'Actioned' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          {hasActiveFilters && (
            <button onClick={clearFilters} className="bb-btn bb-btn--ghost bb-btn--sm">Clear</button>
          )}
        </div>
      )}

      {/* ── Bulk Action Bar ── */}
      {keyboard.selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
          background: 'rgba(255, 90, 31, 0.08)', borderRadius: 8, margin: '0 0 4px',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
            {keyboard.selectedIds.size} selected
          </span>
          <button className="bb-btn bb-btn--ghost bb-btn--sm" onClick={handleBulkArchive}><Archive size={13} /> Archive</button>
          <button className="bb-btn bb-btn--ghost bb-btn--sm" onClick={handleBulkDone}><CheckCircle2 size={13} /> Done</button>
          <button className="bb-btn bb-btn--ghost bb-btn--sm" onClick={clearSelection}><X size={12} /> Clear</button>
        </div>
      )}

      {/* ── Message List ── */}
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
              onSnooze={(id, e) => {
                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                setSnoozeTargetId(id);
                setSnoozeAnchor({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
              }}
              onReply={() => setSelectedMessage(msg)}
              onStar={handleStar}
              onClick={() => setSelectedMessage(msg)}
              focused={idx === keyboard.selectedIndex}
              selected={keyboard.selectedIds.has(msg.id)}
              onToggleSelect={() => toggleSelect(msg.id)}
              starred={starredIds.has(msg.id)}
            />
          ))
        )}
      </div>

      {/* ── Snooze Picker — Task #7 ── */}
      {snoozeTargetId && snoozeAnchor && (
        <SnoozePickerPopover
          anchor={snoozeAnchor}
          onSnooze={(time) => handleSnooze(snoozeTargetId, time)}
          onClose={() => { setSnoozeTargetId(null); setSnoozeAnchor(null); }}
        />
      )}

      {/* ── Email Reading Drawer ── */}
      <InboxDrawer
        message={selectedMessage}
        open={selectedMessage !== null}
        onClose={() => setSelectedMessage(null)}
        onArchive={(id) => { handleArchive(id); setSelectedMessage(null); }}
        onDone={(id) => { handleDone(id); setSelectedMessage(null); }}
        onReply={handleReply}
        onNavigate={handleNavigate}
        threadMessages={selectedMessage ? SEED_THREAD_MESSAGES[selectedMessage.id] : undefined}
      />

      {/* ── Undo Toast Stack — Task #7 ── */}
      <UndoToastStack
        toasts={undoToasts}
        onDismiss={(id) => setUndoToasts(prev => prev.filter(t => t.id !== id))}
        onUndo={(toast) => { toast.undo(); setUndoToasts(prev => prev.filter(t => t.id !== toast.id)); }}
      />

      {/* ── Keyboard Shortcuts Overlay ── */}
      <InboxShortcutsOverlay
        isOpen={keyboard.showShortcuts}
        onClose={() => keyboard.setShowShortcuts(false)}
      />
    </TabShell>
  );
}

// ---------------------------------------------------------------------------
// Category Pills Bar — Task #10
// ---------------------------------------------------------------------------

const PILL_ORDER: CategoryPillType[] = ['all', 'priority', 'updates', 'feed', 'receipts'];

function CategoryPillsBar({
  activePill,
  onSelect,
  counts,
  hasUnreadPriority,
}: {
  activePill: CategoryPillType;
  onSelect: (pill: CategoryPillType) => void;
  counts: Record<CategoryPillType, number>;
  hasUnreadPriority: boolean;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '8px 0 4px',
      overflowX: 'auto',
      scrollbarWidth: 'none',
    }}>
      <style>{`
        @keyframes bb-pill-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.3); }
          50% { box-shadow: 0 0 0 4px rgba(255,255,255,0); }
        }
      `}</style>
      {PILL_ORDER.map((pill) => {
        const cfg = PILL_CONFIG[pill];
        const isActive = activePill === pill;
        const count = counts[pill];
        const isPriority = pill === 'priority';
        const shouldPulse = isPriority && hasUnreadPriority && !isActive;

        // Determine if light mode
        const isLightMode = typeof document !== 'undefined' && document.documentElement.classList.contains('light');

        const pillStyle: React.CSSProperties = isActive
          ? {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 20,
              border: '1px solid transparent',
              background: isLightMode ? '#1A1A1B' : 'rgba(255,255,255,0.95)',
              color: isLightMode ? '#FFFFFF' : '#0A0A0B',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 150ms ease, color 150ms ease',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              animation: shouldPulse ? 'bb-pill-pulse 2s ease-in-out infinite' : 'none',
            }
          : {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 20,
              border: isLightMode ? '1px solid rgba(0,0,0,0.08)' : 'none',
              background: isLightMode ? 'rgba(0,0,0,0.05)' : 'rgba(10, 14, 23, 0.42)',
              backdropFilter: isLightMode ? 'none' : 'blur(20px) saturate(1.2)',
              WebkitBackdropFilter: isLightMode ? 'none' : 'blur(20px) saturate(1.2)',
              boxShadow: isLightMode ? 'none' : 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
              color: isLightMode ? '#6B7280' : 'var(--text-secondary, #94A3B8)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'transform 150ms ease, color 150ms ease, background 150ms ease',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              animation: shouldPulse ? 'bb-pill-pulse 2s ease-in-out infinite' : 'none',
            };

        return (
          <button
            key={pill}
            onClick={() => onSelect(pill)}
            style={pillStyle}
            onMouseEnter={(e) => {
              if (!isActive && !isLightMode) {
                e.currentTarget.style.transform = 'scale(1.02)';
              }
              if (!isActive) {
                e.currentTarget.style.color = isLightMode ? '#111827' : 'var(--text-primary, #F1F5F9)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              if (!isActive) {
                e.currentTarget.style.color = isLightMode ? '#6B7280' : 'var(--text-secondary, #94A3B8)';
              }
            }}
          >
            {cfg.label}
            {count > 0 && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                minWidth: 20,
                height: 16,
                borderRadius: 8,
                background: isActive ? (isLightMode ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)') : 'transparent',
                color: isActive ? (isLightMode ? '#FFFFFF' : 'rgba(255,255,255,0.95)') : (isLightMode ? '#6B7280' : 'var(--text-secondary, #94A3B8)'),
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                lineHeight: 1,
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Undo Toast Stack — Task #7
// ---------------------------------------------------------------------------

function UndoToastStack({
  toasts,
  onDismiss,
  onUndo,
}: {
  toasts: ToastEntry[];
  onDismiss: (id: string) => void;
  onUndo: (toast: ToastEntry) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      zIndex: 200,
      alignItems: 'center',
      pointerEvents: 'none',
    }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 16px',
            borderRadius: 10,
            background: 'rgba(20, 26, 38, 0.95)',
            backdropFilter: 'blur(20px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            pointerEvents: 'auto',
            animation: 'fadeSlideUp 200ms ease',
          }}
        >
          <style>{`@keyframes fadeSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 400 }}>
            {toast.message}
          </span>
          <button
            onClick={() => onUndo(toast)}
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              border: '1px solid rgba(255,90,31,0.4)',
              background: 'rgba(255,90,31,0.12)',
              color: '#FF7A45',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,90,31,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,90,31,0.12)'; }}
          >
            Undo
          </button>
          <button
            onClick={() => onDismiss(toast.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: 20, borderRadius: 4, border: 'none',
              background: 'transparent', color: 'rgba(255,255,255,0.3)',
              cursor: 'pointer', padding: 0,
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Snooze Picker Popover — Task #7
// ---------------------------------------------------------------------------

function SnoozePickerPopover({
  anchor,
  onSnooze,
  onClose,
}: {
  anchor: { top: number; right: number };
  onSnooze: (time: string) => void;
  onClose: () => void;
}) {
  const options = getSnoozeOptions();

  return (
    <div
      data-snooze-picker="true"
      style={{
        position: 'fixed',
        top: anchor.top,
        right: anchor.right,
        zIndex: 150,
        background: 'rgba(14, 18, 28, 0.96)',
        backdropFilter: 'blur(20px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        minWidth: 200,
        animation: 'fadeSlideUp 150ms ease',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 4px' }}>
        Snooze until
      </div>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onSnooze(opt.value)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '8px 10px',
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: 'rgba(255,255,255,0.8)',
            fontSize: 13,
            cursor: 'pointer',
            transition: 'background 100ms ease',
            textAlign: 'left',
            gap: 16,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={13} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
            {opt.label}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
            {opt.sublabel}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Brief Panel — Task #18
// ---------------------------------------------------------------------------

function AiBriefPanel({
  messages,
  onArchiveAll,
  onFilterTo,
}: {
  messages: InboxMessage[];
  onArchiveAll: (category: CategoryPillType) => void;
  onFilterTo: (pill: CategoryPillType) => void;
}) {
  const priorityMsgs = messages.filter(PILL_CONFIG.priority.filter);
  const updatesMsgs = messages.filter(PILL_CONFIG.updates.filter);
  const feedMsgs = messages.filter(PILL_CONFIG.feed.filter);

  const briefLines: string[] = [];
  if (priorityMsgs.length > 0) {
    const topSenders = priorityMsgs.slice(0, 3).map(m => m.contactName || m.senderName || 'Unknown');
    briefLines.push(`${priorityMsgs.length} priority message${priorityMsgs.length > 1 ? 's' : ''} from ${topSenders.join(', ')}.`);
  }
  if (updatesMsgs.length > 0) {
    briefLines.push(`${updatesMsgs.length} update${updatesMsgs.length > 1 ? 's' : ''} ready to review.`);
  }
  if (feedMsgs.length > 0) {
    briefLines.push(`${feedMsgs.length} personal message${feedMsgs.length > 1 ? 's' : ''} in Feed.`);
  }
  if (briefLines.length === 0) briefLines.push('Your inbox looks clear.');

  return (
    <div style={{
      position: 'absolute',
      top: 'calc(100% + 8px)',
      right: 0,
      zIndex: 100,
      background: 'rgba(12, 16, 24, 0.96)',
      backdropFilter: 'blur(24px) saturate(1.3)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
      border: '1px solid rgba(99,102,241,0.3)',
      borderRadius: 12,
      padding: 16,
      width: 320,
      boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)',
      animation: 'fadeSlideUp 150ms ease',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Sparkles size={13} style={{ color: '#A78BFA' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#A78BFA', letterSpacing: '0.02em' }}>AI Brief</span>
      </div>

      {/* Brief text */}
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: '0 0 14px', lineHeight: 1.6 }}>
        {briefLines.join(' ')}
      </p>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {priorityMsgs.length > 0 && (
          <button
            onClick={() => onFilterTo('priority')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid rgba(99,102,241,0.2)',
              background: 'rgba(99,102,241,0.08)',
              color: '#A78BFA', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
          >
            <span>Show Priority only</span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>{priorityMsgs.length}</span>
          </button>
        )}
        {feedMsgs.length > 0 && (
          <button
            onClick={() => onArchiveAll('feed')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.03)',
              color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
          >
            <span>Archive all Feed</span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>{feedMsgs.length}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inbox Skeleton
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
        <div className="bb-inbox-list">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bb-inbox-row" style={{ opacity: 1 - i * 0.1 }}>
              <div className="bb-inbox-row__col1">
                <div style={{ ...shimmer, width: 28, height: 28, borderRadius: 8 }} />
                <div style={{ ...shimmer, width: 80 + (i % 3) * 20, height: 13 }} />
              </div>
              <div className="bb-inbox-row__col2" style={{ gap: 8 }}>
                <div style={{ ...shimmer, width: 56, height: 18, borderRadius: 10 }} />
                <div style={{ ...shimmer, width: 140 + (i % 4) * 30, height: 13 }} />
                <div style={{ ...shimmer, width: 200 + (i % 3) * 40, height: 11 }} />
              </div>
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
// Stat Pill
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

function InboxSelect({ value, onChange, label, options }: {
  value: string; onChange: (v: string) => void; label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="bb-inbox-select" aria-label={label}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Message Row — with hover actions including Snooze + Reply (Task #7)
// ---------------------------------------------------------------------------

function MessageRow({
  message, onArchive, onDone, onSnooze, onReply, onStar, onClick, focused, selected, onToggleSelect, starred,
}: {
  message: InboxMessage;
  onArchive?: (id: string) => void;
  onDone?: (id: string) => void;
  onSnooze?: (id: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  onReply?: (id: string) => void;
  onStar?: (id: string) => void;
  onClick?: () => void;
  focused?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  starred?: boolean;
}) {
  const ChannelIcon = CHANNEL_ICONS[message.channelType] || GmailIcon;
  const brandColor = CHANNEL_BRAND_COLORS[message.channelType] || 'var(--text-dim)';
  const isUnread = message.status === 'unread';
  const isImportant = message.significance >= 7;
  const timeAgo = formatTimeAgo(message.receivedAt);
  const sender = message.contactName || message.senderName || message.senderEmail || 'Unknown';

  const level = message.significance >= 8 ? 'critical' :
    message.significance >= 6 ? 'high' :
    message.significance >= 5 ? 'medium' : undefined;

  const email = message.senderEmail;
  const syncAvatar = resolveAvatarSync(sender, email);
  const [avatar, setAvatar] = useState<AvatarResult>(syncAvatar);

  useEffect(() => {
    let cancelled = false;
    resolveAvatar(email, sender, null).then((result) => { if (!cancelled) setAvatar(result); });
    return () => { cancelled = true; };
  }, [email, sender]);

  const actionBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    minWidth: 28,
    borderRadius: 8,
    border: 'none',
    background: 'rgba(15, 20, 30, 0.9)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    gap: 0,
    padding: 0,
    transition: 'all 150ms ease',
    whiteSpace: 'nowrap',
  };

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
        ...(focused ? { background: 'rgba(255,255,255,0.04)', outline: '1px solid rgba(255,255,255,0.1)' } : {}),
        ...(selected ? { background: 'rgba(255, 90, 31, 0.06)' } : {}),
      } as React.CSSProperties}
    >
      {/* Checkbox */}
      <div
        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
        style={{
          width: 18, height: 18, borderRadius: 4,
          border: `1.5px solid ${selected ? '#FF5A1F' : 'rgba(255,255,255,0.15)'}`,
          background: selected ? 'rgba(255,90,31,0.2)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, cursor: 'pointer', transition: 'all 0.15s ease',
        }}
      >
        {selected && <CheckCircle2 size={12} style={{ color: '#FF5A1F' }} />}
      </div>

      {/* Col 1: Avatar + sender */}
      <div className="bb-inbox-row__col1">
        <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
          {avatar?.url ? (
            <img src={avatar.url} alt={sender} width={32} height={32}
              style={{ borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--border-subtle)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
            }}>
              {sender[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--card-bg, #1a1a2e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: brandColor,
          }}>
            <ChannelIcon size={9} />
          </div>
        </div>
        <span className="bb-inbox-row__sender">{sender}</span>
      </div>

      {/* Col 2: Tag + subject + preview */}
      <div className="bb-inbox-row__col2">
        <span className={`bb-inbox-row__tag bb-inbox-row__tag--${message.category}`}>
          {getCategoryLabel(message.category)}
        </span>
        {message.subject && (
          <span className="bb-inbox-row__subject">
            {message.subject}
            {message.threadCount && message.threadCount > 1 && (
              <span style={{ marginLeft: 6, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>
                ({message.threadCount})
              </span>
            )}
          </span>
        )}
        <span className="bb-inbox-row__preview">
          {message.aiSummary ? (
            <>{message.aiSummary}</>
          ) : (
            message.bodyPreview
          )}
        </span>
      </div>

      {/* Right: time + hover actions crossfade */}
      <div className="bb-inbox-row__meta" style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexShrink: 0,
        minWidth: 60,
      }}>
        <div className="bb-inbox-row__meta-default">
          {starred && <Star size={11} style={{ color: '#f59e0b', fill: '#f59e0b', marginRight: 4 }} />}
          <span className="bb-inbox-row__time">{timeAgo}</span>
        </div>
        <div className="bb-inbox-row__hover-actions" style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          opacity: 0,
          pointerEvents: 'none',
          transition: 'opacity 150ms ease',
          background: 'linear-gradient(to right, transparent, rgba(15, 20, 30, 0.9) 20%)',
          paddingLeft: 20,
          paddingRight: 0,
        }}>
          <button
            className="bb-inbox-row__action"
            style={actionBtnStyle}
            title="Archive (E)"
            onClick={(e) => { e.stopPropagation(); onArchive?.(message.id); }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15, 20, 30, 0.95)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15, 20, 30, 0.9)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          >
            <Archive size={14} />
          </button>
          <button
            className="bb-inbox-row__action"
            style={actionBtnStyle}
            title="Done (D)"
            onClick={(e) => { e.stopPropagation(); onDone?.(message.id); }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15, 20, 30, 0.95)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15, 20, 30, 0.9)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          >
            <CheckCircle2 size={14} />
          </button>
          <button
            className="bb-inbox-row__action"
            style={actionBtnStyle}
            title="Snooze (S)"
            onClick={(e) => { e.stopPropagation(); onSnooze?.(message.id, e); }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15, 20, 30, 0.95)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15, 20, 30, 0.9)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          >
            <Clock size={14} />
          </button>
          <button
            className="bb-inbox-row__action"
            style={actionBtnStyle}
            title="Reply (R)"
            onClick={(e) => { e.stopPropagation(); onReply?.(message.id); }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15, 20, 30, 0.95)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15, 20, 30, 0.9)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          >
            <Reply size={14} />
          </button>
          <button
            className="bb-inbox-row__action"
            style={{ ...actionBtnStyle, color: starred ? '#f59e0b' : 'rgba(255,255,255,0.6)' }}
            title="Star (*)"
            onClick={(e) => { e.stopPropagation(); onStar?.(message.id); }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15, 20, 30, 0.95)'; e.currentTarget.style.color = starred ? '#fbbf24' : 'rgba(255,255,255,0.85)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15, 20, 30, 0.9)'; e.currentTarget.style.color = starred ? '#f59e0b' : 'rgba(255,255,255,0.6)'; }}
          >
            <Star size={14} style={{ fill: starred ? '#f59e0b' : 'none' }} />
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
