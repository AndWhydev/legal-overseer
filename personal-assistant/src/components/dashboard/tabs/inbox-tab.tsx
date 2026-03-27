'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { useDevOverrides } from '@/lib/dev/dev-overrides';
import { useInboxKeyboard } from '@/hooks/use-inbox-keyboard';
import { InboxShortcutsOverlay } from '@/components/dashboard/inbox-shortcuts-overlay';
import { TabShell } from '@/components/ui/tab-shell';
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import {
  Tabs as AnimTabs,
  TabsList as AnimTabsList,
  TabsTrigger as AnimTabsTrigger,
} from '@/components/animate-ui/components/radix/tabs';
import { logger } from '@/lib/core/logger';
import { type ThreadMessageItem } from '@/components/dashboard/inbox-drawer';
import {
  IconCircleCheck,
  IconChevronDown,
  IconChevronRight,
  IconRefresh,
  IconCalendar,
  IconX,
  IconArchive,
  IconClock,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconAlertTriangle,
  IconAlertCircle,
  IconStar,
  IconArrowUp,
  IconTrash,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { resolveAvatar, resolveAvatarSync, type AvatarResult } from '@/lib/avatar/resolver';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MessageCategory = 'action_required' | 'fyi' | 'conversation' | 'automated' | 'marketing' | 'spam';
type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';
type ThreadStatus = 'waiting_on_you' | 'waiting_on_them' | 'resolved' | 'new';
type CategoryPillType = 'all' | 'action' | 'waiting' | 'direct' | 'email' | 'notifications' | 'billing';

interface InboxMessage {
  id: string;
  channelType: string;
  senderName: string | null;
  senderEmail: string | null;
  subject: string | null;
  bodyPreview: string;
  fullBody: string;
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
// Notification Grouping — Apple Intelligence style
// ---------------------------------------------------------------------------

type DisplayItem =
  | { type: 'individual'; message: InboxMessage }
  | { type: 'group'; groupKey: string; label: string; channelType: string;
      messages: InboxMessage[]; newestAt: string; hasUnread: boolean };

function getGroupKey(msg: InboxMessage): string | null {
  switch (msg.category) {
    case 'action_required': return `action:${msg.senderEmail || msg.senderName || 'unknown'}`;
    case 'automated': return `auto:${msg.channelType}`;
    case 'marketing': return `mkt:${msg.senderEmail || msg.senderName || 'unknown'}`;
    case 'fyi':
    case 'conversation': return `contact:${msg.contactId || msg.senderEmail || msg.senderName || 'unknown'}`;
    default: return null;
  }
}

function getGroupLabel(key: string, representative: InboxMessage): string {
  if (key.startsWith('auto:')) {
    const channel = key.slice(5);
    const names: Record<string, string> = {
      asana: 'Asana', stripe: 'Stripe', calendly: 'Calendly',
      gmail: 'Gmail', outlook: 'Outlook', slack: 'Slack',
    };
    return names[channel] || channel;
  }
  if (key.startsWith('action:')) {
    return representative.senderName || representative.senderEmail || 'Action Required';
  }
  if (key.startsWith('mkt:')) {
    return representative.senderName || representative.senderEmail || 'Newsletter';
  }
  return representative.contactName || representative.senderName || representative.senderEmail || 'Unknown';
}

function groupMessages(messages: InboxMessage[], activePill: CategoryPillType): DisplayItem[] {

  const groupMap = new Map<string, InboxMessage[]>();
  const order: (string | InboxMessage)[] = [];

  for (const msg of messages) {
    const key = getGroupKey(msg);
    if (!key) {
      order.push(msg);
      continue;
    }
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
      order.push(key);
    }
    groupMap.get(key)!.push(msg);
  }

  const items: DisplayItem[] = [];
  for (const entry of order) {
    if (typeof entry === 'string') {
      const msgs = groupMap.get(entry)!;
      if (msgs.length < 2) {
        // Single message — dissolve back to individual
        items.push({ type: 'individual', message: msgs[0] });
      } else {
        msgs.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
        items.push({
          type: 'group',
          groupKey: entry,
          label: getGroupLabel(entry, msgs[0]),
          channelType: msgs[0].channelType,
          messages: msgs,
          newestAt: msgs[0].receivedAt,
          hasUnread: msgs.some(m => m.status === 'unread'),
        });
      }
    } else {
      items.push({ type: 'individual', message: entry });
    }
  }

  // Sort by most-recent timestamp
  items.sort((a, b) => {
    const aTime = a.type === 'group' ? a.newestAt : a.message.receivedAt;
    const bTime = b.type === 'group' ? b.newestAt : b.message.receivedAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return items;
}

// ---------------------------------------------------------------------------
// Category Pill Config
// ---------------------------------------------------------------------------

const PILL_CONFIG: Record<CategoryPillType, {
  label: string;
  filter: (m: InboxMessage) => boolean;
}> = {
  all:           { label: 'All',           filter: (m) => m.category !== 'spam' && m.category !== 'marketing' },
  action:        { label: 'Action',        filter: (m) => m.category === 'action_required' },
  waiting:       { label: 'Waiting',       filter: (m) => m.threadStatus === 'waiting_on_you' && m.category !== 'spam' && m.category !== 'marketing' && m.category !== 'automated' },
  direct:        { label: 'Direct',        filter: (m) => ['whatsapp', 'imessage', 'sms', 'slack'].includes(m.channelType) },
  email:         { label: 'Email',         filter: (m) => ['gmail', 'outlook'].includes(m.channelType) && m.category !== 'spam' && m.category !== 'marketing' },
  notifications: { label: 'Notifications', filter: (m) => m.category === 'automated' },
  billing:       { label: 'Billing',       filter: (m) => ['stripe', 'xero'].includes(m.channelType) },
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
  return <IconCalendar size={size} />;
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
// Text sanitization
// ---------------------------------------------------------------------------

function sanitizeText(text: string): string {
  if (!text) return '';
  // SSR-safe: decode common HTML entities manually
  let result = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#9;/g, '\t')
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&deg;/g, '\u00B0')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&nbsp;/g, '\u00A0')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  // Strip remaining HTML tags
  result = result.replace(/<[^>]*>/g, '');
  // Normalize whitespace
  result = result.replace(/[\t ]+/g, ' ').trim();
  return result;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SEED_MESSAGES: InboxMessage[] = [
  {
    id: 's1', channelType: 'gmail', senderName: 'Sarah Chen', senderEmail: 'sarah@designstudio.co',
    subject: 'Website revision — final round feedback', bodyPreview: 'Hey, the client loved the new hero section but wants the CTA button colour changed to match their brand guide...', fullBody: 'Hey, the client loved the new hero section but wants the CTA button colour changed to match their brand guide. Can you update it before the presentation on Friday? They want it to match hex #2B5BA0 from their style guide.\n\nAlso, they mentioned the font on the pricing page feels too small on mobile — can we bump it up a notch?\n\nThanks!',
    aiSummary: 'Client approved hero section but wants CTA button colour updated to match brand guide. Action needed before presentation.',
    category: 'action_required', priority: 'high', significance: 8, contactId: 'c1', contactName: 'Sarah Chen',
    threadStatus: 'waiting_on_you', deduplicatedWith: null, threadCount: 3,
    receivedAt: new Date(Date.now() - 12 * 60000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  {
    id: 's2', channelType: 'whatsapp', senderName: 'Andy Wu', senderEmail: null,
    subject: null, bodyPreview: 'Can you check the Sentry dashboard? Getting a spike in 500s on the checkout flow since the last deploy',
    fullBody: 'Can you check the Sentry dashboard? Getting a spike in 500s on the checkout flow since the last deploy.\n\nIt started around 2pm, right after the v2.4.1 release went out. Looks like it might be the new payment validation middleware.',
    aiSummary: 'Checkout flow seeing 500 error spike post-deploy. Needs immediate Sentry investigation.',
    category: 'action_required', priority: 'critical', significance: 9, contactId: 'c2', contactName: 'Andy Wu',
    threadStatus: 'waiting_on_you', deduplicatedWith: null, threadCount: 2,
    receivedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  {
    id: 's3', channelType: 'asana', senderName: 'Asana', senderEmail: 'notifications@asana.com',
    subject: 'Task assigned: Q1 brand refresh deliverables', bodyPreview: 'You have been assigned to "Q1 brand refresh deliverables" in project Brand & Identity. Due: Mar 7',
    fullBody: 'You have been assigned to "Q1 brand refresh deliverables" in project Brand & Identity. Due: Mar 7\n\nThis task includes:\n- Updated logo variations (horizontal, stacked, icon-only)\n- Refreshed colour palette with accessibility audit\n- Social media template kit (Instagram, LinkedIn, Twitter)\n\nPlease review the brief in the project description.',
    aiSummary: 'Assigned to Q1 brand refresh deliverables in Brand & Identity project. Due March 7.',
    category: 'automated', priority: 'medium', significance: 6, contactId: null, contactName: null,
    threadStatus: 'new', deduplicatedWith: null,
    receivedAt: new Date(Date.now() - 45 * 60000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  {
    id: 's4', channelType: 'stripe', senderName: 'Stripe', senderEmail: 'notifications@stripe.com',
    subject: 'Payment received — $4,200.00', bodyPreview: 'Invoice INV-2024-0089 for DesignStudio Co has been paid. Amount: $4,200.00 AUD',
    fullBody: 'Invoice INV-2024-0089 for DesignStudio Co has been paid.\n\nAmount: $4,200.00 AUD\nPayment method: Visa ending in 4242\nDate: 17 Mar 2026\n\nView receipt: https://dashboard.stripe.com/...',
    aiSummary: 'DesignStudio Co paid $4,200 AUD for invoice INV-2024-0089.',
    category: 'automated', priority: 'low', significance: 4, contactId: 'c1', contactName: 'Sarah Chen',
    threadStatus: null, deduplicatedWith: null,
    receivedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  {
    id: 's5', channelType: 'gmail', senderName: 'Tom Bradley', senderEmail: 'tom@acmecorp.com',
    subject: 'Re: Proposal for Q2 retainer', bodyPreview: "Thanks for sending that through. I've shared it with our CFO. Expecting a decision by end of week.",
    fullBody: "Thanks for sending that through. I've shared it with our CFO and he's reviewing the scope and pricing now.\n\nExpecting a decision by end of week. If we go ahead, we'd want to kick off the first week of April.\n\nOne question — does the retainer include ad-hoc design requests, or is that billed separately?",
    aiSummary: 'Q2 retainer proposal shared with CFO. Decision expected by end of week. No action needed yet.',
    category: 'fyi', priority: 'medium', significance: 5, contactId: 'c3', contactName: 'Tom Bradley',
    threadStatus: 'waiting_on_them', deduplicatedWith: null, threadCount: 4,
    receivedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'actioned',
  },
  {
    id: 's6', channelType: 'calendly', senderName: 'Calendly', senderEmail: 'notifications@calendly.com',
    subject: 'New booking: Discovery call with Mira Patel', bodyPreview: 'Mira Patel booked a 30-min discovery call for tomorrow at 10:00 AM AEST',
    fullBody: 'Mira Patel booked a 30-min discovery call for tomorrow at 10:00 AM AEST.\n\nEvent: Discovery Call\nDuration: 30 minutes\nDate: Tomorrow, 10:00 AM AEST\nLocation: Google Meet (link in calendar invite)\n\nNote from Mira: "Looking to discuss a website redesign for our e-commerce store. Currently on Shopify but considering a custom build."',
    aiSummary: 'Mira Patel booked a 30-min discovery call for tomorrow at 10 AM AEST.',
    category: 'automated', priority: 'medium', significance: 5, contactId: null, contactName: 'Mira Patel',
    threadStatus: 'new', deduplicatedWith: null,
    receivedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'actioned',
  },
  {
    id: 's7', channelType: 'gmail', senderName: 'LinkedIn', senderEmail: 'notifications@linkedin.com',
    subject: '3 people viewed your profile', bodyPreview: 'Your profile was viewed by a Product Manager at Canva, a Design Lead at Atlassian, and 1 other',
    fullBody: 'Your profile was viewed by a Product Manager at Canva, a Design Lead at Atlassian, and 1 other.\n\nSee who viewed your profile and connect with them on LinkedIn.',
    aiSummary: 'LinkedIn notification — 3 profile views including Canva PM and Atlassian Design Lead.',
    category: 'marketing', priority: 'low', significance: 1, contactId: null, contactName: null,
    threadStatus: null, deduplicatedWith: null,
    receivedAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'archived',
  },
  {
    id: 's8', channelType: 'whatsapp', senderName: 'Jess Reilly', senderEmail: null,
    subject: null, bodyPreview: 'Lunch tomorrow? That new ramen place on Crown St just opened',
    fullBody: 'Lunch tomorrow? That new ramen place on Crown St just opened 🍜\n\nApparently the tonkotsu is insane. 12:30 work?',
    aiSummary: 'Lunch invite for tomorrow at new ramen place on Crown St.',
    category: 'conversation', priority: 'low', significance: 3, contactId: 'c4', contactName: 'Jess Reilly',
    threadStatus: 'waiting_on_you', deduplicatedWith: null,
    receivedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
  // Generate 42 more seed messages to reach 50 total for realistic testing
  ...Array.from({ length: 42 }, (_, i) => {
    const names = ['Alex Kim', 'Maria Lopez', 'James Wilson', 'Emma Davis', 'Raj Patel', 'Lisa Zhang', 'Ben O\'Brien', 'Natasha Roy'];
    const channels: InboxMessage['channelType'][] = ['gmail', 'outlook', 'whatsapp', 'asana', 'stripe', 'slack', 'calendly'];
    const categories: MessageCategory[] = ['action_required', 'fyi', 'automated', 'conversation', 'fyi', 'automated'];
    const priorities: PriorityLevel[] = ['critical', 'high', 'medium', 'low'];
    const subjects = [
      'Invoice follow-up', 'Meeting notes from sync', 'Design assets ready', 'Quick question about scope',
      'Monthly report attached', 'New task assigned', 'Sprint retro action items', 'Domain renewal reminder',
      'Client onboarding checklist', 'SEO audit results', 'Social media calendar draft', 'Bug report — login flow',
    ];
    return {
      id: `sg-${i + 9}`,
      channelType: channels[i % channels.length],
      senderName: names[i % names.length],
      senderEmail: `${names[i % names.length].toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
      subject: subjects[i % subjects.length],
      bodyPreview: `Preview text for generated message ${i + 9}. This is a realistic inbox message body preview.`,
      fullBody: `Preview text for generated message ${i + 9}. This is a realistic inbox message body preview.\n\nThis is the full body of the message with additional context that would normally be truncated in the preview.`,
      aiSummary: i % 3 === 0 ? `AI summary for message ${i + 9}` : null,
      category: categories[i % categories.length],
      priority: priorities[i % priorities.length],
      significance: (i % 8) + 2,
      contactId: null,
      contactName: names[i % names.length],
      threadStatus: i % 4 === 0 ? 'waiting_on_you' as const : i % 4 === 1 ? 'new' as const : null,
      threadCount: (i % 3) + 1,
      deduplicatedWith: null,
      receivedAt: new Date(Date.now() - (i + 9) * 3600000).toISOString(),
      processedAt: new Date().toISOString(),
      status: i % 3 === 0 ? 'unread' : 'actioned',
    } satisfies InboxMessage;
  }),
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
  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newMessageAlert, setNewMessageAlert] = useState(false);

  // New state for P2-5, P2-2, P4-5
  const [activePill, setActivePill] = useState<CategoryPillType>('action');
  const [undoToasts, setUndoToasts] = useState<ToastEntry[]>([]);
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [snoozeAnchor, setSnoozeAnchor] = useState<{ top: number; right: number } | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());
  const lastClickedIndexRef = useRef<number>(-1);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Notification grouping
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [collapsingGroupKey, setCollapsingGroupKey] = useState<string | null>(null);
  const collapsingGroupRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Collapse animation
  const [collapsingId, setCollapsingId] = useState<string | null>(null);
  const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const expandedIdRef = useRef<string | null>(null);
  expandedIdRef.current = expandedId;

  const COLLAPSE_DURATION = 180;

  const closeExpanded = useCallback(() => {
    const currentExpanded = expandedIdRef.current;
    if (currentExpanded) {
      setCollapsingId(currentExpanded);
      setExpandedId(null);
      if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = setTimeout(() => {
        setCollapsingId(null);
      }, COLLAPSE_DURATION);
    }
  }, []);

  // Pagination — server-side cursor
  const PAGE_SIZE = 25;
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const devOverrides = useDevOverrides();
  const useSeeded = devOverrides?.seed_data?.inbox ?? false;

  // Reset pagination when filters change
  useEffect(() => { setHasMore(true); }, [activePill, channelFilter, priorityFilter]);

  // ── Computed: displayed — defined early so callbacks can reference it ──
  const displayed = useMemo(() => {
    return messages.filter(m => {
      if (snoozedIds.has(m.id)) return false;
      if (channelFilter && m.channelType !== channelFilter) return false;
      if (priorityFilter && m.priority !== priorityFilter) return false;
      const pillFilter = PILL_CONFIG[activePill]?.filter;
      if (pillFilter && !pillFilter(m)) return false;
      return true;
    });
  }, [messages, channelFilter, priorityFilter, activePill, snoozedIds]);

  const displayItems = useMemo(
    () => groupMessages(displayed, activePill),
    [displayed, activePill]
  );

  const handleGroupClick = useCallback((groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        // Collapse with animation
        next.delete(groupKey);
        setCollapsingGroupKey(groupKey);
        if (collapsingGroupRef.current) clearTimeout(collapsingGroupRef.current);
        // Stagger out takes ~220ms (last child delay + duration), container 180ms
        collapsingGroupRef.current = setTimeout(() => setCollapsingGroupKey(null), 250);
      } else {
        // Expand — cancel any in-progress collapse
        if (collapsingGroupKey) {
          clearTimeout(collapsingGroupRef.current);
          setCollapsingGroupKey(null);
        }
        next.add(groupKey);
      }
      return next;
    });
  }, [collapsingGroupKey]);

  const pillCounts = useMemo(() => {
    const counts: Record<CategoryPillType, number> = { all: 0, action: 0, waiting: 0, direct: 0, email: 0, notifications: 0, billing: 0 };
    const nonSnooze = messages.filter(m => !snoozedIds.has(m.id));
    for (const m of nonSnooze) {
      for (const [key, cfg] of Object.entries(PILL_CONFIG) as [CategoryPillType, typeof PILL_CONFIG[CategoryPillType]][]) {
        if (cfg.filter(m)) counts[key]++;
      }
    }
    return counts;
  }, [messages, snoozedIds]);

  const hasUnreadPriority = useMemo(
    () => messages.some(m => m.category === 'action_required' && m.status === 'unread' && !snoozedIds.has(m.id)),
    [messages, snoozedIds]
  );

  // ── Fetch ──
  const fetchInbox = useCallback(async (opts: { isRefresh?: boolean; loadMore?: boolean } = {}) => {
    if (useSeeded) return;
    const { isRefresh = false, loadMore = false } = opts;

    if (loadMore) setLoadingMore(true);
    else if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      // Channel + priority filtering is done client-side (no re-fetch needed)
      params.set('limit', String(PAGE_SIZE));
      if (loadMore) params.set('offset', String(messagesRef.current.length));

      const response = await fetch(`/api/agent/inbox?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const newMessages = data.messages || [];

      if (loadMore) {
        setMessages(prev => [...prev, ...newMessages]);
      } else {
        setMessages(newMessages);
      }
      setTotal(data.total || 0);
      setHasMore(loadMore
        ? newMessages.length >= PAGE_SIZE
        : newMessages.length < (data.total || 0));
      setError(null);
    } catch (err) {
      logger.error('[inbox-tab] fetch error:', err);
      if (!loadMore) setError('Failed to load inbox');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [useSeeded]);

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
    if (!useSeeded) fetchInbox({ isRefresh: true });
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
        fetch(`/api/agent/inbox/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unarchive' }) });
      });
    }
    await fetch(`/api/agent/inbox/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'archive' }) });
  }, [messages, addToast]);

  const handleDone = useCallback(async (id: string) => {
    await fetch(`/api/agent/inbox/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'done' }) });
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'processed' } : m));
    addToast('Marked as done', () => {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'unread' } : m));
      fetch(`/api/agent/inbox/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'undo_done' }) });
    });
  }, [addToast]);

  const handleSnooze = useCallback(async (id: string, snoozedUntil: string) => {
    setSnoozedIds(prev => new Set([...prev, id]));
    setSnoozeTargetId(null);
    setSnoozeAnchor(null);
    addToast('Message snoozed', () => {
      setSnoozedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      fetch(`/api/agent/inbox/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unsnooze' }) });
    });
    await fetch(`/api/agent/inbox/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'snooze', snoozed_until: snoozedUntil }) });
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
    await fetch(`/api/agent/inbox/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'spam' }) });
  }, [messages, addToast]);

  const handleDelete = useCallback(async (id: string) => {
    const msg = messages.find(m => m.id === id);
    if (msg) {
      const ageHours = (Date.now() - new Date(msg.receivedAt).getTime()) / 3600000;
      if (ageHours < 24 && !confirm('Permanently delete this message?')) return;
    }
    setMessages(prev => prev.filter(m => m.id !== id));
    setTotal(prev => prev - 1);
    await fetch(`/api/agent/inbox/${id}`, { method: 'DELETE' });
  }, [messages]);

  const handleReply = useCallback(async (id: string, body: string) => {
    const res = await fetch(`/api/agent/inbox/${id}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Send failed' }));
      addToast(data.error || 'Failed to send reply', () => {});
    } else {
      addToast('Reply sent', () => {});
    }
  }, [addToast]);

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    const currentId = expandedId;
    if (!currentId) return;
    const currentIndex = displayed.findIndex(m => m.id === currentId);
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= 0 && nextIndex < displayed.length) {
      setExpandedId(displayed[nextIndex].id);
    }
  }, [expandedId, displayed]);

  // ── Keyboard hook (group-aware) ──
  const keyboard = useInboxKeyboard({
    enabled: true,
    messageCount: displayItems.length,
    onOpen: (index) => {
      const item = displayItems[index];
      if (!item) return;
      if (item.type === 'group') {
        handleGroupClick(item.groupKey);
      } else {
        setExpandedId(prev => prev === item.message.id ? null : item.message.id);
      }
    },
    onArchive: (index) => {
      const item = displayItems[index];
      if (!item) return;
      if (item.type === 'group') {
        item.messages.forEach(m => handleArchive(m.id));
      } else {
        handleArchive(item.message.id);
      }
    },
    onDone: (index) => {
      const item = displayItems[index];
      if (!item) return;
      if (item.type === 'group') {
        item.messages.forEach(m => handleDone(m.id));
      } else {
        handleDone(item.message.id);
      }
    },
    onReply: () => {},
    onForward: () => {},
    onSnooze: () => {},
    onStar: () => {},
    onDelete: (index) => {
      const item = displayItems[index];
      if (!item) return;
      if (item.type === 'group') {
        item.messages.forEach(m => handleDelete(m.id));
      } else {
        handleDelete(item.message.id);
      }
    },
    onSpam: () => {},
    onSelect: (index) => {
      const item = displayItems[index];
      if (!item) return;
      if (item.type === 'group') {
        keyboard.setSelectedIds((prev: Set<string>) => {
          const next = new Set(prev);
          item.messages.forEach(m => next.add(m.id));
          return next;
        });
      } else {
        toggleSelect(item.message.id);
      }
    },
    onSelectAll: () => {
      keyboard.setSelectedIds(new Set(displayed.map(m => m.id)));
    },
    onDeselectAll: () => keyboard.setSelectedIds(new Set()),
    onCategorySwitch: () => {},
    onSearch: () => {},
    onClose: () => {
      closeExpanded();
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

  const handleRowClick = useCallback((id: string, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && index >= 0) {
      // Range select from lastClickedIndex to current (group-aware)
      e.preventDefault();
      const start = Math.min(lastClickedIndexRef.current >= 0 ? lastClickedIndexRef.current : index, index);
      const end = Math.max(lastClickedIndexRef.current >= 0 ? lastClickedIndexRef.current : index, index);
      keyboard.setSelectedIds((prev: Set<string>) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          const item = displayItems[i];
          if (!item) continue;
          if (item.type === 'group') {
            item.messages.forEach(m => next.add(m.id));
          } else {
            next.add(item.message.id);
          }
        }
        return next;
      });
      lastClickedIndexRef.current = index;
    } else if (e.metaKey || e.ctrlKey) {
      // Toggle individual selection
      e.preventDefault();
      keyboard.setSelectedIds((prev: Set<string>) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      lastClickedIndexRef.current = index;
    } else {
      // Plain click — toggle inline expansion with collapse animation
      lastClickedIndexRef.current = index;
      if (expandedId === id) {
        closeExpanded();
      } else {
        // Cancel any in-progress collapse
        if (collapsingId) {
          clearTimeout(collapseTimeoutRef.current);
          setCollapsingId(null);
        }
        setExpandedId(id);
      }
    }
  }, [displayItems, keyboard, expandedId, closeExpanded, collapsingId]);

  const clearSelection = useCallback(() => keyboard.setSelectedIds(new Set()), [keyboard]);

  const handleBulkArchive = useCallback(() => {
    keyboard.selectedIds.forEach(id => handleArchive(id));
    clearSelection();
  }, [keyboard.selectedIds, handleArchive, clearSelection]);

  const handleBulkDone = useCallback(() => {
    keyboard.selectedIds.forEach(id => handleDone(id));
    clearSelection();
  }, [keyboard.selectedIds, handleDone, clearSelection]);

  const handleBulkSpam = useCallback(() => {
    keyboard.selectedIds.forEach(id => handleSpam(id));
    clearSelection();
  }, [keyboard.selectedIds, handleSpam, clearSelection]);

  if (loading && !useSeeded) return <InboxSkeleton />;

  if (error && messages.length === 0) {
    return (
      <TabShell>
        <Empty>
          <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
          <EmptyTitle>{"Couldn't load inbox"}</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => fetchInbox()}>Retry</Button>
          </EmptyContent>
        </Empty>
      </TabShell>
    );
  }

  if (!error && messages.length === 0 && !useSeeded) {
    return (
      <TabShell>
        <Empty>
          <EmptyTitle>No messages yet</EmptyTitle>
          <EmptyDescription>Messages from your connected channels appear here. Connect email or WhatsApp to start receiving messages.</EmptyDescription>
          <EmptyContent>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'settings-connections' } }))} className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">Connect a channel</button>
          </EmptyContent>
        </Empty>
      </TabShell>
    );
  }

  const unreadCount = displayed.filter(m => m.status === 'unread').length;
  const actionableCount = displayed.filter(m => m.category === 'action_required').length;
  const waitingCount = displayed.filter(m => m.threadStatus === 'waiting_on_you').length;
  const totalCount = useSeeded ? displayed.length : total;

  return (
    <TabShell scrollable={false} variant="fixed">
      {/* ── Fixed Header: toolbar + filters (doesn't scroll with messages) ── */}
      <div style={{
        flexShrink: 0,
        zIndex: 10,
        paddingBottom: 8,
      }}>
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
              <button onClick={() => setNewMessageAlert(false)} className="bb-btn bb-btn--ghost bb-btn--sm text-emerald-500">
                <span className="bb-inbox-pulse" />
                New messages
              </button>
            )}
            <button
              onClick={async () => {
                setRefreshing(true);
                try {
                  const res = await fetch('/api/inbox/refresh', { method: 'POST' });
                  if (res.ok) {
                    const data = await res.json();
                    if (data.results?.some((r: { result: { messagesInserted: number } }) => r.result.messagesInserted > 0)) {
                      await fetchInbox({ isRefresh: true });
                    }
                  }
                } catch { /* ignore */ }
                setRefreshing(false);
              }}
              disabled={refreshing}
              title="Pull latest messages"
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg border-none bg-muted px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-all hover:text-foreground hover:scale-[1.02] ${refreshing ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <IconRefresh size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              {refreshing ? 'Syncing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* ── Unified Filter Bar ── */}
        <UnifiedFilterBar
          activePill={activePill}
          onPillSelect={setActivePill}
          pillCounts={pillCounts}
          hasUnreadPriority={hasUnreadPriority}
          channelFilter={channelFilter}
          onChannelChange={setChannelFilter}
          priorityFilter={priorityFilter}
          onPriorityChange={setPriorityFilter}
        />
      </div>

      {/* ── Scrollable Message List ── */}
      <div className="bb-inbox-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="bb-inbox-list bb-stagger">
        {displayItems.length === 0 ? (
          <Empty>
            <EmptyTitle>All caught up</EmptyTitle>
            <EmptyDescription>No messages to show. Adjust filters or wait for new messages.</EmptyDescription>
          </Empty>
        ) : (
          <>
            {displayItems.map((item, idx) => {
              if (item.type === 'group') {
                const isGroupExpanded = expandedGroups.has(item.groupKey);
                const isGroupCollapsing = collapsingGroupKey === item.groupKey;
                const showChildren = isGroupExpanded || isGroupCollapsing;
                return (
                  <div key={item.groupKey} className="bb-inbox-group-wrapper">
                    <GroupRow
                      item={item}
                      index={idx}
                      expanded={isGroupExpanded || isGroupCollapsing}
                      focused={idx === keyboard.selectedIndex}
                      selected={item.messages.every(m => keyboard.selectedIds.has(m.id))}
                      onClick={() => handleGroupClick(item.groupKey)}
                      onDelete={() => item.messages.forEach(m => handleDelete(m.id))}
                    />
                    {showChildren && (
                      <div
                        className={`bb-inbox-group__children${isGroupCollapsing ? ' is-collapsing' : ''}`}
                        style={{ pointerEvents: isGroupCollapsing ? 'none' : 'auto' }}
                      >
                        {item.messages.map((msg, childIdx) => (
                          <div
                            key={msg.id}
                            className="bb-inbox-group__item"
                            style={{ '--stagger': childIdx } as React.CSSProperties}
                          >
                            <MessageRow
                              message={msg}
                              index={idx}
                              expanded={expandedId === msg.id || collapsingId === msg.id}
                              onArchive={handleArchive}
                              onDone={handleDone}
                              onDelete={handleDelete}
                              onSnooze={(id, e) => {
                                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                setSnoozeTargetId(id);
                                setSnoozeAnchor({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                              }}
                              onReply={() => setExpandedId(msg.id)}
                              onStar={handleStar}
                              onRowClick={handleRowClick}
                              focused={false}
                              selected={keyboard.selectedIds.has(msg.id)}
                              starred={starredIds.has(msg.id)}
                              insideGroup
                            />
                            {(expandedId === msg.id || collapsingId === msg.id) && (
                              <ExpandedMessageRow
                                message={msg}
                                threadMessages={SEED_THREAD_MESSAGES[msg.id]}
                                onArchive={(id) => { handleArchive(id); setExpandedId(null); }}
                                onDone={(id) => { handleDone(id); setExpandedId(null); }}
                                onSpam={(id) => { handleSpam(id); setExpandedId(null); }}
                                onReply={handleReply}
                                onClose={closeExpanded}
                                isCollapsing={collapsingId === msg.id}
                                insideGroup
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              const msg = item.message;
              return (
                <React.Fragment key={msg.id}>
                  <MessageRow
                    message={msg}
                    index={idx}
                    expanded={expandedId === msg.id || collapsingId === msg.id}
                    onArchive={handleArchive}
                    onDone={handleDone}
                    onDelete={handleDelete}
                    onSnooze={(id, e) => {
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      setSnoozeTargetId(id);
                      setSnoozeAnchor({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                    }}
                    onReply={() => setExpandedId(msg.id)}
                    onStar={handleStar}
                    onRowClick={handleRowClick}
                    focused={idx === keyboard.selectedIndex}
                    selected={keyboard.selectedIds.has(msg.id)}
                    starred={starredIds.has(msg.id)}
                  />
                  {(expandedId === msg.id || collapsingId === msg.id) && (
                    <ExpandedMessageRow
                      message={msg}
                      threadMessages={SEED_THREAD_MESSAGES[msg.id]}
                      onArchive={(id) => { handleArchive(id); setExpandedId(null); }}
                      onDone={(id) => { handleDone(id); setExpandedId(null); }}
                      onSpam={(id) => { handleSpam(id); setExpandedId(null); }}
                      onReply={handleReply}
                      onClose={closeExpanded}
                      isCollapsing={collapsingId === msg.id}
                    />
                  )}
                </React.Fragment>
              );
            })}
            {/* Pagination: Load more (server-side) */}
            {hasMore && !useSeeded && displayed.length > 0 && (
              <button
                onClick={() => fetchInbox({ loadMore: true })}
                disabled={loadingMore}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '12px 0',
                  marginTop: 4,
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--hover-bg)',
                  color: loadingMore ? 'var(--text-dim)' : 'var(--text-secondary)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: loadingMore ? 'default' : 'pointer',
                  transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                onMouseEnter={(e) => {
                  if (!loadingMore) {
                    e.currentTarget.style.background = 'var(--hover-bg-strong)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--hover-bg)';
                  if (!loadingMore) e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                {loadingMore ? (
                  <>
                    <IconRefresh size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    Loading...
                  </>
                ) : (
                  <>Load more {total > messages.length ? `(${total - messages.length} remaining)` : ''}</>
                )}
              </button>
            )}
          </>
        )}
      </div>
      </div>{/* end scrollable wrapper */}

      {/* ── Floating Bulk Action Bar ── */}
      {keyboard.selectedIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--bg-card-solid)',
          backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
          WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
          border: '1px solid var(--glass-card-border)',
          borderRadius: 12,
          boxShadow: `0 8px 32px ${'var(--bg-overlay, rgba(0, 0, 0, 0.6))'}, 0 2px 8px rgba(0, 0, 0, 0.3)`,
          zIndex: 50,
          animation: 'fadeSlideUp 160ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            {keyboard.selectedIds.size} selected
          </span>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 8, border: '1px solid var(--glass-divider)', background: 'var(--hover-bg)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 150ms ease' }}
            onClick={handleBulkArchive}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
          ><IconArchive size={13} /> Archive</button>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 8, border: '1px solid var(--glass-divider)', background: 'var(--hover-bg)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 150ms ease' }}
            onClick={handleBulkDone}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
          ><IconCircleCheck size={13} /> Done</button>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 8, border: '1px solid var(--glass-divider)', background: 'var(--hover-bg)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 150ms ease' }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setSnoozeTargetId(Array.from(keyboard.selectedIds)[0]);
              setSnoozeAnchor({ top: rect.top - 200, right: window.innerWidth - rect.right });
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
          ><IconClock size={13} /> Snooze</button>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 8, border: '1px solid var(--glass-divider)', background: 'var(--hover-bg)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 150ms ease' }}
            onClick={handleBulkSpam}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
          ><IconAlertTriangle size={13} /> Spam</button>
          <button style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 8, border: '1px solid var(--glass-divider)', background: 'var(--hover-bg)', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer', padding: 0, transition: 'all 150ms ease' }}
            onClick={clearSelection}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
          ><IconX size={12} /></button>
        </div>
      )}

      {/* ── Snooze Picker — Task #7 ── */}
      {snoozeTargetId && snoozeAnchor && (
        <SnoozePickerPopover
          anchor={snoozeAnchor}
          onSnooze={(time) => handleSnooze(snoozeTargetId, time)}
          onClose={() => { setSnoozeTargetId(null); setSnoozeAnchor(null); }}
        />
      )}

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
// Unified Filter Bar — single row with smart categories + dropdowns
// ---------------------------------------------------------------------------

const PILL_ORDER: CategoryPillType[] = ['all', 'action', 'waiting', 'direct', 'email', 'notifications', 'billing'];

const CHANNEL_OPTIONS = [
  { value: '', label: 'All channels', icon: null },
  { value: 'gmail', label: 'Gmail', color: '#EA4335' },
  { value: 'outlook', label: 'Outlook', color: '#0078D4' },
  { value: 'whatsapp', label: 'WhatsApp', color: '#25D366' },
  { value: 'asana', label: 'Asana', color: '#F06A6A' },
  { value: 'calendly', label: 'Calendly', color: '#006BFF' },
  { value: 'stripe', label: 'Stripe', color: '#635BFF' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Any priority' },
  { value: 'critical', label: 'Critical', color: '#FF3B30' },
  { value: 'high', label: 'High', color: '#FF9500' },
  { value: 'medium', label: 'Medium', color: '#FFCC00' },
  { value: 'low', label: 'Low', color: 'var(--text-dim)' },
];

function FilterDropdown({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: string; label: string; color?: string }[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  const isFiltered = value !== '';

  const toggleOpen = useCallback(() => {
    setOpen(prev => {
      if (!prev && ref.current) {
        const rect = ref.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 4, left: rect.left });
      }
      return !prev;
    });
  }, []);

  // Click-outside: check both the trigger ref AND the portal dropdown ref
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on scroll of the tab panel (clipping ancestor)
  useEffect(() => {
    if (!open) return;
    const tabPanel = ref.current?.closest('.bb-tab-panel');
    if (!tabPanel) return;
    const handleScroll = () => setOpen(false);
    tabPanel.addEventListener('scroll', handleScroll, { passive: true });
    return () => tabPanel.removeEventListener('scroll', handleScroll);
  }, [open]);

  const dropdownMenu = open && dropdownPos ? (
    <div ref={dropdownRef} style={{
      position: 'fixed',
      top: dropdownPos.top,
      left: dropdownPos.left,
      zIndex: 9999,
      minWidth: 160,
      padding: 4,
      borderRadius: 12,
      background: 'var(--bg-card-solid)',
      backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
      WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
      border: '1px solid var(--glass-card-border)',
      boxShadow: `0 8px 32px ${'var(--bg-overlay, rgba(0, 0, 0, 0.6))'}`,
      animation: 'fadeSlideUp 120ms cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => { onChange(opt.value); setOpen(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: isSelected ? 'var(--hover-bg-strong)' : 'transparent',
              color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 14,
              fontWeight: isSelected ? 600 : 400,
              cursor: 'pointer',
              transition: 'background 100ms ease',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--hover-bg)'; }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
          >
            {opt.color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />}
            {opt.label}
            {isSelected && <IconCircleCheck size={11} style={{ marginLeft: 'auto', opacity: 0.6 }} />}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={toggleOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 12px 4px 12px',
          borderRadius: 8,
          border: isFiltered ? '1px solid var(--glass-card-border)' : '1px solid var(--glass-divider)',
          background: isFiltered ? 'var(--hover-bg-strong)' : 'var(--hover-bg)',
          color: isFiltered ? 'var(--text-primary)' : 'var(--text-dim)',
          fontSize: 14,
          fontWeight: isFiltered ? 600 : 400,
          cursor: 'pointer',
          transition: 'all 150ms ease',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg-strong)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = isFiltered ? 'var(--hover-bg-strong)' : 'var(--hover-bg)'; e.currentTarget.style.color = isFiltered ? 'var(--text-primary)' : 'var(--text-dim)'; }}
      >
        {selected?.color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: selected.color, flexShrink: 0 }} />}
        {selected?.label || label}
        <IconChevronDown size={11} style={{ opacity: 0.5, transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {typeof document !== 'undefined' && dropdownMenu && createPortal(dropdownMenu, document.body)}
    </div>
  );
}

function UnifiedFilterBar({
  activePill,
  onPillSelect,
  pillCounts,
  hasUnreadPriority,
  channelFilter,
  onChannelChange,
  priorityFilter,
  onPriorityChange,
}: {
  activePill: CategoryPillType;
  onPillSelect: (pill: CategoryPillType) => void;
  pillCounts: Record<CategoryPillType, number>;
  hasUnreadPriority: boolean;
  channelFilter: string;
  onChannelChange: (v: string) => void;
  priorityFilter: string;
  onPriorityChange: (v: string) => void;
}) {
  const hasActiveFilters = channelFilter || priorityFilter;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 py-2">
      <AnimTabs value={activePill} onValueChange={(v) => onPillSelect(v as CategoryPillType)}>
        <AnimTabsList>
          {PILL_ORDER.map((pill) => {
            const cfg = PILL_CONFIG[pill];
            return (
              <AnimTabsTrigger key={pill} value={pill}>
                {cfg.label}
                {pill !== 'all' && pillCounts[pill] > 0 && (
                  <span className="text-muted-foreground">{pillCounts[pill]}</span>
                )}
              </AnimTabsTrigger>
            );
          })}
        </AnimTabsList>
      </AnimTabs>

      <div className="flex-1" />

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => { onChannelChange(''); onPriorityChange(''); }}
          aria-label="Clear filters"
        >
          <IconX size={14} />
        </Button>
      )}

      <Select value={channelFilter} onValueChange={onChannelChange}>
        <SelectTrigger className="w-auto">
          <SelectValue placeholder="Channel" />
        </SelectTrigger>
        <SelectContent>
          {CHANNEL_OPTIONS.map(o => (
            <SelectItem key={o.value} value={o.value || '_all'}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={priorityFilter} onValueChange={onPriorityChange}>
        <SelectTrigger className="w-auto">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          {PRIORITY_OPTIONS.map(o => (
            <SelectItem key={o.value} value={o.value || '_all'}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
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
            padding: '12px 16px',
            borderRadius: 12,
            background: 'var(--bg-card-solid)',
            backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
            WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
            border: '1px solid var(--glass-card-border)',
            boxShadow: `0 8px 32px ${'var(--bg-overlay, rgba(0, 0, 0, 0.6))'}`,
            pointerEvents: 'auto',
            animation: 'fadeSlideUp 160ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <style>{`@keyframes fadeSlideUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 400 }}>
            {toast.message}
          </span>
          <button
            onClick={() => onUndo(toast)}
            style={{
              padding: '4px 12px',
              borderRadius: 8,
              border: `1px solid ${'var(--border-focus-ring, rgba(255, 255, 255, 0.2))'}`,
              background: 'var(--hover-bg-strong, rgba(255, 255, 255, 0.08))',
              color: 'var(--text-primary, #E2E8F0)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-active, rgba(255, 255, 255, 0.1))'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hover-bg-strong, rgba(255, 255, 255, 0.08))'; }}
          >
            Undo
          </button>
          <button
            onClick={() => onDismiss(toast.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: 20, borderRadius: 4, border: 'none',
              background: 'transparent', color: 'var(--text-dim)',
              cursor: 'pointer', padding: 0,
            }}
          >
            <IconX size={12} />
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
        background: 'var(--bg-card-solid)',
        backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
        WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
        border: '1px solid var(--glass-card-border)',
        borderRadius: 12,
        padding: 8,
        boxShadow: `0 8px 32px ${'var(--bg-overlay, rgba(0, 0, 0, 0.6))'}`,
        minWidth: 200,
        animation: 'fadeSlideUp 140ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '8px 12px 4px' }}>
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
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 14,
            cursor: 'pointer',
            transition: 'background 100ms ease',
            textAlign: 'left',
            gap: 16,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg-strong)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconClock size={13} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
            {opt.label}
          </span>
          <span style={{ fontSize: 14, color: 'var(--text-dim)', flexShrink: 0 }}>
            {opt.sublabel}
          </span>
        </button>
      ))}
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
  borderRadius: 8,
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
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
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
                <div style={{ ...shimmer, width: 56, height: 18, borderRadius: 12 }} />
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
// Expanded Message Row — inline content panel (replaces drawer)
// ---------------------------------------------------------------------------

function generateContextualDraft(message: InboxMessage): string | null {
  // No draft for non-actionable categories
  if (['automated', 'marketing', 'spam', 'fyi'].includes(message.category)) return null;

  const senderFirstName = (message.contactName || message.senderName || 'there').split(' ')[0];
  const text = ((message.subject || '') + ' ' + (message.fullBody || message.bodyPreview)).toLowerCase();

  // Conversation category — casual tone
  if (message.category === 'conversation') {
    if (text.match(/lunch|dinner|coffee|drinks|catch up|hang out|ramen/)) {
      return `Hey ${senderFirstName}! Sounds great, I'm in. Let me check my calendar and confirm the time.`;
    }
    return `Hey ${senderFirstName}, thanks for the message! I'll get back to you on this shortly.`;
  }

  // Action required — contextual based on content
  if (text.match(/error|crash|spike|500|bug|broke|down|outage|sentry|incident/)) {
    return `Hi ${senderFirstName},\n\nOn it — I'll investigate and report back with findings shortly.`;
  }
  if (text.match(/invoice|payment|billing|overdue|outstanding/)) {
    return `Hi ${senderFirstName},\n\nThanks for flagging. I'll review the billing details and update our records.`;
  }
  if (text.match(/proposal|retainer|quote|pricing|scope|contract/)) {
    return `Hi ${senderFirstName},\n\nThanks for the update on the proposal. I'll review and follow up with any questions.`;
  }
  if (text.match(/design|revision|feedback|mockup|wireframe|brand|colour|color|font|hero|cta/)) {
    return `Hi ${senderFirstName},\n\nThanks for the feedback. I'll make the requested changes and send an updated version.`;
  }
  if (text.match(/meeting|call|sync|standup|retro|agenda/)) {
    return `Hi ${senderFirstName},\n\nThanks — I'll review the details and come prepared.`;
  }
  if (text.match(/deadline|due|deliver|ship|launch|release/)) {
    return `Hi ${senderFirstName},\n\nNoted on the timeline. I'll prioritise accordingly and keep you posted on progress.`;
  }
  if (text.match(/review|approve|confirm|sign off|check/)) {
    return `Hi ${senderFirstName},\n\nI'll take a look and get back to you with my review.`;
  }

  // Fallback for action_required with no specific match
  return `Hi ${senderFirstName},\n\nThanks for this. I'll look into it and follow up shortly.`;
}

function extractSummaryInline(message: InboxMessage): { summary: string; actionItems: string[]; draftReply: string | null } {
  const body = message.fullBody || message.bodyPreview;
  const text = (message.subject || '') + ' ' + body;
  const actionItems: string[] = [];
  // Only extract actions for action_required messages
  if (message.category === 'action_required') {
    const actionMatch = text.match(/(?:can you|could you|please)\s+([^,.!?]{10,60})/i);
    if (actionMatch) actionItems.push(actionMatch[1].trim());
    const deadlineMatch = text.match(/(due|deadline|before|by end of)\s+([^,.!?\n]{3,40})/i);
    if (deadlineMatch) actionItems.push(`Deadline: ${deadlineMatch[0].trim()}`);
    if (text.match(/urgent|asap|immediately|critical|error|crash|spike in|500\s*error/i)) {
      actionItems.push('Urgent — needs immediate attention');
    }
    if (text.match(/you have been assigned|please review|please confirm|action required/i)) {
      actionItems.push('Action assigned to you');
    }
  }
  // Summary: first 2-3 sentences, not arbitrarily truncated
  const sentences = body.match(/[^.!?\n]+[.!?]+/g);
  const summary = sentences && sentences.length > 0
    ? sentences.slice(0, 3).join(' ').trim()
    : body;
  const draftReply = generateContextualDraft(message);
  return { summary, actionItems: actionItems.slice(0, 3), draftReply };
}

// AI result cache — avoids re-simulating loading on re-open
const aiResultCache = new Map<string, { summary: string; actionItems: string[]; draftReply: string | null }>();

function ExpandedMessageRow({
  message,
  threadMessages,
  onArchive,
  onDone,
  onSpam,
  onReply,
  onClose,
  isCollapsing = false,
  insideGroup = false,
}: {
  message: InboxMessage;
  threadMessages?: ThreadMessageItem[];
  onArchive: (id: string) => void;
  onDone: (id: string) => void;
  onSpam: (id: string) => void;
  onReply: (id: string, body: string) => void;
  onClose: () => void;
  isCollapsing?: boolean;
  insideGroup?: boolean;
}) {
  const [replyText, setReplyText] = useState('');
  const [replyFocused, setReplyFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const [aiResult, setAiResult] = useState<{ summary: string; actionItems: string[]; draftReply: string | null } | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  // Track whether AI result was freshly computed (not cached) for shimmer transition
  const [aiJustResolved, setAiJustResolved] = useState(false);

  // Ghost draft state
  const [ghostVisible, setGhostVisible] = useState(true);
  const [ghostDismissed, setGhostDismissed] = useState(false);
  const ghostTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Thread view state
  const latestThreadId = threadMessages?.[threadMessages.length - 1]?.id;
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(new Set(latestThreadId ? [latestThreadId] : []));

  const showSummary = message.significance >= 5;
  const hasThread = threadMessages && threadMessages.length > 1;

  // Scroll into view on mount
  useEffect(() => {
    setTimeout(() => {
      expandedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }, []);

  // AI summary — check cache first, simulate load only on first open
  useEffect(() => {
    if (!showSummary) { setAiLoading(false); return; }
    const cached = aiResultCache.get(message.id);
    if (cached) {
      setAiResult(cached);
      setAiLoading(false);
      setAiJustResolved(false);
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    setAiJustResolved(false);
    const timer = setTimeout(() => {
      const result = extractSummaryInline(message);
      aiResultCache.set(message.id, result);
      setAiResult(result);
      setAiLoading(false);
      setAiJustResolved(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [message.id, showSummary]);

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'TEXTAREA' && replyFocused) {
          textareaRef.current?.blur();
          return;
        }
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, replyFocused]);

  // Ghost draft reappear after clearing textarea
  useEffect(() => {
    if (replyText === '' && ghostDismissed) {
      ghostTimerRef.current = setTimeout(() => {
        setGhostVisible(true);
        setGhostDismissed(false);
      }, 500);
      return () => clearTimeout(ghostTimerRef.current);
    }
  }, [replyText, ghostDismissed]);

  const handleAutoExpand = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReplyText(e.target.value);
    if (e.target.value) {
      setGhostVisible(false);
      setGhostDismissed(true);
    }
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const handleSendReply = () => {
    if (replyText.trim()) {
      onReply(message.id, replyText);
      setReplyText('');
    }
  };

  const handleNavigateLocal = (action: string) => {
    if (action === 'snooze') {
      // Dispatch snooze event for parent to handle
      const btn = expandedRef.current?.querySelector('[data-snooze-trigger]') as HTMLButtonElement | null;
      if (btn) btn.click();
    }
  };

  const sender = message.contactName || message.senderName || message.senderEmail || 'Unknown';
  const ChannelIcon = CHANNEL_ICONS[message.channelType] || GmailIcon;
  const brandColor = CHANNEL_BRAND_COLORS[message.channelType] || 'var(--text-dim)';
  const fullDate = new Date(message.receivedAt).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const toggleThread = (id: string) => {
    setExpandedThreadIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  return (
    <div
      ref={expandedRef}
      style={{
        borderRadius: insideGroup ? '0 0 8px 8px' : '0 0 12px 12px',
        marginTop: insideGroup ? 0 : -6,
        background: 'var(--bg-card)',
        backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
        WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
        overflow: 'hidden',
        animation: isCollapsing
          ? 'collapseOut 180ms cubic-bezier(0.4, 0, 1, 1) forwards'
          : 'expandIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: isCollapsing ? 'none' : 'auto',
      }}
    >
      <style>{`
        @keyframes expandIn {
          from { opacity: 0; max-height: 0; transform: translateY(-4px); }
          to { opacity: 1; max-height: 2000px; transform: translateY(0); }
        }
        @keyframes collapseOut {
          from { opacity: 1; max-height: 2000px; transform: translateY(0); }
          to { opacity: 0; max-height: 0; transform: translateY(-4px); }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* Header -- sender + email on one line */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: brandColor, flexShrink: 0 }}>
            <ChannelIcon size={13} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            {sanitizeText(String(sender))}
          </span>
          {message.senderEmail && (
            <>
              <span style={{ color: 'var(--text-dim)', margin: '0 2px' }}>&middot;</span>
              <span style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 400 }}>
                {String(message.senderEmail)}
              </span>
            </>
          )}
          <span style={{ fontSize: 14, color: 'var(--text-dim)', marginLeft: 'auto', flexShrink: 0 }}>
            {fullDate}
          </span>
        </div>
      </div>

      {/* Content area with max-height scroll */}
      <div style={{
        padding: '16px 20px',
        display: 'flex', flexDirection: 'column', gap: 16,
        maxHeight: '60vh',
        overflowY: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--hover-bg-strong) transparent',
      }}>
        {/* Subject */}
        {message.subject && (
          <h3 style={{
            fontSize: 16, fontWeight: 500, color: 'var(--text-primary)',
            margin: 0, lineHeight: 1.3,
          }}>
            {sanitizeText(String(message.subject))}
          </h3>
        )}

        {/* Content: crossfade from raw body → AI summary with shimmer */}
        <div style={{ position: 'relative', minHeight: 20 }}>
          {/* Raw body — visible while AI loading, fades out when AI arrives */}
          <div style={{
            fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'opacity 300ms cubic-bezier(0.25, 1, 0.5, 1), filter 300ms cubic-bezier(0.25, 1, 0.5, 1)',
            opacity: (showSummary && aiResult && !aiLoading) ? 0 : 1,
            filter: (showSummary && aiResult && !aiLoading) ? 'blur(2px)' : 'none',
            position: (showSummary && aiResult && !aiLoading) ? 'absolute' : 'relative',
            pointerEvents: (showSummary && aiResult && !aiLoading) ? 'none' : 'auto',
            top: 0, left: 0, right: 0,
          }}>
            {sanitizeText(String(message.fullBody || message.bodyPreview || '(No message body)'))}
          </div>

          {/* AI summary — fades in with shimmer when resolved */}
          {showSummary && aiResult && !aiLoading && (
            <p className={aiJustResolved ? 'bb-ai-shine' : undefined} style={{
              fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6,
              margin: 0,
              animation: aiJustResolved
                ? 'aiContentIn 400ms cubic-bezier(0.25, 1, 0.5, 1) both, bb-ai-shine 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.15s forwards'
                : undefined,
            }}>
              {sanitizeText(aiResult.summary)}
            </p>
          )}
        </div>

        {/* Action items — subtle metadata line joined with separator */}
        {aiResult && aiResult.actionItems.length > 0 && (
          <div style={{
            fontSize: 14, fontStyle: 'italic', color: 'var(--text-secondary)',
            lineHeight: 1.5,
            animation: aiJustResolved ? 'aiContentIn 300ms cubic-bezier(0.25, 1, 0.5, 1) both' : undefined,
            animationDelay: aiJustResolved ? '150ms' : undefined,
          }}>
            {aiResult.actionItems.map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ margin: '0 6px', color: 'var(--text-dim)' }}>&middot;</span>}
                {sanitizeText(item)}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Attachment pills stub */}
        <AttachmentPills attachments={undefined} />

        {/* Thread view */}
        {hasThread && threadMessages && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {threadMessages.length} messages in thread
            </div>
            {threadMessages.map((tm) => {
              if (!tm || !tm.id) return null;
              const isExpTh = expandedThreadIds.has(tm.id);
              const isLatest = tm.id === latestThreadId;
              const tmSender = tm.senderName || 'Unknown';
              return (
                <div key={tm.id} style={{
                  borderRadius: 8,
                  border: `1px solid ${isLatest ? 'var(--glass-card-border)' : 'var(--glass-divider)'}`,
                  background: isLatest ? 'var(--hover-bg)' : 'transparent',
                  overflow: 'hidden',
                }}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                      cursor: isLatest ? 'default' : 'pointer', userSelect: 'none',
                    }}
                    onClick={() => !isLatest && toggleThread(tm.id)}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: tm.isSelf ? 'var(--border-active, rgba(255, 255, 255, 0.1))' : 'var(--hover-bg-strong, rgba(255, 255, 255, 0.08))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 500,
                      color: tm.isSelf ? '#E2E8F0' : 'var(--text-secondary)', flexShrink: 0,
                    }}>
                      {String(tmSender[0] || '?').toUpperCase()}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', flexShrink: 0 }}>
                      {tm.isSelf ? 'You' : tmSender}
                    </span>
                    {!isExpTh && !isLatest && (
                      <span style={{ fontSize: 14, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {sanitizeText(String(tm.bodyPreview || '').slice(0, 70))}
                      </span>
                    )}
                    <span style={{ fontSize: 14, color: 'var(--text-dim)', flexShrink: 0, marginLeft: 'auto' }}>
                      {formatTimeAgo(tm.receivedAt)}
                    </span>
                    {!isLatest && (
                      <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
                        {isExpTh ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />}
                      </span>
                    )}
                  </div>
                  {(isExpTh || isLatest) && (
                    <div style={{
                      padding: '0 12px 10px 42px', fontSize: 14, color: 'var(--text-secondary)',
                      lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {sanitizeText(String(tm.bodyPreview || ''))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chat-style reply composer — slides up smoothly */}
      <div style={{
        padding: '12px 20px 16px',
        animation: 'composerSlideIn 350ms cubic-bezier(0.25, 1, 0.5, 1) both',
        animationDelay: aiResult ? '0ms' : '600ms',
      }}>
        <div style={{
          background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
          border: `1px solid ${'var(--border-subtle, rgba(255, 255, 255, 0.03))'}`,
          borderRadius: 20,
          padding: '4px 4px 4px 16px',
        }}>
          <div style={{ position: 'relative', minHeight: 32 }}>
            {/* Ghost draft — in-flow element that sizes the container, textarea overlays it */}
            {ghostVisible && !replyText && aiResult?.draftReply && (
              <div
                className={aiJustResolved ? 'bb-ai-shine' : undefined}
                aria-hidden="true"
                style={{
                  padding: '8px 0',
                  color: 'var(--text-dim)',
                  fontStyle: 'italic',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  pointerEvents: 'none',
                  maxHeight: 200,
                  overflow: 'hidden',
                  animation: aiJustResolved ? 'aiContentIn 400ms cubic-bezier(0.25, 1, 0.5, 1) both' : undefined,
                  animationDelay: aiJustResolved ? '100ms' : undefined,
                }}
              >
                {sanitizeText(aiResult.draftReply)}
              </div>
            )}
            <textarea
              ref={textareaRef}
              className="bb-inbox-reply-textarea"
              value={replyText}
              onChange={handleAutoExpand}
              onFocus={() => setReplyFocused(true)}
              onBlur={() => setReplyFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && ghostVisible && !replyText && aiResult?.draftReply) {
                  e.preventDefault();
                  const draft = aiResult.draftReply;
                  setReplyText(draft);
                  setGhostVisible(false);
                  setGhostDismissed(true);
                  setTimeout(() => {
                    if (textareaRef.current) {
                      textareaRef.current.style.height = 'auto';
                      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
                      textareaRef.current.setSelectionRange(draft.length, draft.length);
                    }
                  }, 0);
                }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSendReply();
                }
              }}
              placeholder={ghostVisible && aiResult?.draftReply ? '' : 'Reply... (Cmd+Enter to send)'}
              style={{
                position: ghostVisible && !replyText && aiResult?.draftReply ? 'absolute' : 'relative',
                top: 0, left: 0,
                width: '100%',
                height: ghostVisible && !replyText && aiResult?.draftReply ? '100%' : undefined,
                padding: '8px 0',
                color: 'var(--text-primary)',
                fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5,
                resize: 'none', minHeight: ghostVisible && !replyText && aiResult?.draftReply ? undefined : 32,
                maxHeight: 200,
                zIndex: 2,
              }}
            />
          </div>
          {/* Bottom row: hint left, send button right — all inside the pill */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0 4px' }}>
            <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>
              {ghostVisible && !replyText && aiResult?.draftReply ? (
                <span><kbd style={{ fontSize: 14, color: 'var(--text-dim)', padding: '2px 6px', borderRadius: 4, background: 'var(--hover-bg)', fontFamily: 'inherit' }}>Tab</kbd> to use suggested reply</span>
              ) : (
                <span><kbd style={{ fontSize: 14, color: 'var(--text-dim)', padding: '2px 6px', borderRadius: 4, background: 'var(--hover-bg)', fontFamily: 'inherit' }}>Cmd+Enter</kbd> to send</span>
              )}
            </div>
            <button
              onClick={handleSendReply}
              disabled={!replyText.trim()}
              style={{
                width: 32, height: 32, borderRadius: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
                border: 'none', cursor: replyText.trim() ? 'pointer' : 'default',
                flexShrink: 0,
                transition: 'opacity 200ms cubic-bezier(0.25, 1, 0.5, 1), transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
                background: 'var(--btn-primary-bg, #F1F5F9)',
                color: 'var(--btn-primary-fg, #0a0f1a)',
                opacity: replyText.trim() ? 1 : 0.25,
                transform: replyText.trim() ? 'scale(1)' : 'scale(0.85)',
              }}
            >
              <IconArrowUp size={14} stroke={2.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Icon-only action bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '8px 20px 12px',
        animation: 'composerSlideIn 300ms cubic-bezier(0.25, 1, 0.5, 1) both',
        animationDelay: '50ms',
      }}>
        <IconActionBtn icon={<IconArrowBackUp size={16} />} title="Reply" onClick={() => textareaRef.current?.focus()} />
        <IconActionBtn icon={<IconArchive size={16} />} title="Archive" onClick={() => onArchive(message.id)} />
        <IconActionBtn icon={<IconCircleCheck size={16} />} title="Done" onClick={() => onDone(message.id)} />
        <IconActionBtn icon={<IconClock size={16} />} title="Snooze" onClick={() => handleNavigateLocal('snooze')} data-snooze-trigger />
        <IconActionBtn icon={<IconArrowForwardUp size={16} />} title="Forward" onClick={() => {/* placeholder */}} />
        <IconActionBtn icon={<IconAlertTriangle size={16} />} title="Spam" onClick={() => onSpam(message.id)} isSpam />
        <div style={{ flex: 1 }} />
        <IconActionBtn icon={<IconX size={16} />} title="Close" onClick={onClose} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attachment Pills (structural stub — renders nothing when no data)
// ---------------------------------------------------------------------------

function AttachmentPills({ attachments }: { attachments?: { name: string; size: string; type: string }[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {attachments.map((att, i) => (
        <div key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          height: 32, padding: '0 10px', borderRadius: 8,
          background: 'var(--hover-bg)',
          border: '1px solid var(--glass-divider)',
          fontSize: 14, color: 'var(--text-secondary)',
          cursor: 'pointer', transition: 'all 150ms ease',
        }}>
          <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {att.name}
          </span>
          <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>{att.size}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon Action Button — minimal icon-only for expanded row
// ---------------------------------------------------------------------------

function IconActionBtn({
  icon, title, onClick, isSpam, ...rest
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  isSpam?: boolean;
  'data-snooze-trigger'?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 8,
        background: 'transparent', border: 'none',
        color: 'var(--text-dim)', cursor: 'pointer',
        transform: 'scale(1)',
        transition: 'color 150ms, transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.transform = 'scale(1.1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.transform = 'scale(1)'; }}
      {...rest}
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Group Row — Apple Intelligence style collapsed notification group
// ---------------------------------------------------------------------------

function GroupRow({
  item,
  index,
  expanded,
  focused,
  selected,
  onClick,
  onDelete,
}: {
  item: Extract<DisplayItem, { type: 'group' }>;
  index: number;
  expanded: boolean;
  focused?: boolean;
  selected?: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const ChannelIcon = CHANNEL_ICONS[item.channelType] || GmailIcon;
  const brandColor = CHANNEL_BRAND_COLORS[item.channelType] || 'var(--text-dim)';
  const newestMsg = item.messages[0];
  const preview = newestMsg?.aiSummary || newestMsg?.subject || newestMsg?.bodyPreview || '';
  const relTime = formatTimeAgo(item.newestAt);
  const absTime = new Date(item.newestAt).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div
      className="bb-inbox-group"
      data-expanded={expanded || undefined}
      data-focused={focused || undefined}
      data-selected={selected || undefined}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{ cursor: 'pointer' }}
    >
      {/* Chevron — rotating like chain-of-thought dropdown */}
      <svg
        width={13}
        height={13}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          flexShrink: 0,
          color: 'var(--text-dim)',
          transition: 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>

      {/* Channel icon */}
      <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: brandColor }}>
        <ChannelIcon size={14} />
      </div>

      {/* Count badge */}
      <span className="bb-inbox-group__count">
        {item.messages.length}
      </span>

      {/* Label */}
      <span className="bb-inbox-group__label">
        {item.label}
      </span>

      {/* Preview of newest message */}
      <span className="bb-inbox-group__preview">
        {sanitizeText(String(preview))}
      </span>

      {/* Right side: unread dot + time + delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
        {item.hasUnread && (
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bb-blue, #3B82F6)', flexShrink: 0 }} />
        )}
        <span
          className="bb-inbox-row__time"
          title={absTime}
          style={{ whiteSpace: 'nowrap' }}
        >
          {relTime}
        </span>
        {onDelete && (
          <button
            className="bb-inbox-group__delete"
            title="Delete all"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <IconTrash size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Row — time always visible, no hover actions
// ---------------------------------------------------------------------------

function MessageRow({
  message, onArchive, onDone, onSnooze, onReply, onStar, onRowClick, onDelete, index, focused, selected, starred, expanded, insideGroup,
}: {
  message: InboxMessage;
  onArchive?: (id: string) => void;
  onDone?: (id: string) => void;
  onSnooze?: (id: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  onReply?: (id: string) => void;
  onStar?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRowClick?: (id: string, index: number, e: React.MouseEvent) => void;
  index: number;
  focused?: boolean;
  selected?: boolean;
  starred?: boolean;
  expanded?: boolean;
  insideGroup?: boolean;
}) {
  const ChannelIcon = CHANNEL_ICONS[message.channelType] || GmailIcon;
  const brandColor = CHANNEL_BRAND_COLORS[message.channelType] || 'var(--text-dim)';
  const isUnread = message.status === 'unread';
  const isImportant = message.significance >= 7;
  const timeAgo = formatTimeAgo(message.receivedAt);
  const absTime = new Date(message.receivedAt).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
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

  return (
    <div
      className="bb-inbox-row"
      data-unread={isUnread || undefined}
      data-important={isImportant || undefined}
      data-level={level}
      data-focused={focused || undefined}
      data-selected={selected || undefined}
      data-inside-group={insideGroup || undefined}
      onClick={(e) => onRowClick?.(message.id, index, e)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick?.(message.id, index, e as unknown as React.MouseEvent); } }}
      style={{
        '--channel-color': brandColor,
        cursor: 'pointer',
        ...(expanded ? { borderRadius: '12px 12px 0 0' } : {}),
        ...(focused ? { background: 'var(--hover-bg)', outline: '1px solid var(--glass-card-border)' } : {}),
      } as React.CSSProperties}
    >
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
              justifyContent: 'center', fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)',
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
        <span className="bb-inbox-row__sender">{String(sender || '')}</span>
      </div>

      {/* Col 2: Tag + subject + preview */}
      <div className="bb-inbox-row__col2">
        <span
          className={`bb-inbox-row__tag bb-inbox-row__tag--${message.category}`}
          style={TAG_COLORS[message.category]}
        >
          {getCategoryLabel(message.category)}
        </span>
        {message.subject && (
          <span className="bb-inbox-row__subject">
            {String(message.subject || '')}
            {message.threadCount && message.threadCount > 1 && (
              <span style={{ marginLeft: 8, fontSize: 14, color: 'var(--text-dim)', fontWeight: 400 }}>
                ({message.threadCount})
              </span>
            )}
          </span>
        )}
        <span className="bb-inbox-row__preview">
          {message.aiSummary ? (
            <>{sanitizeText(String(message.aiSummary || ''))}</>
          ) : (
            sanitizeText(String(message.bodyPreview || ''))
          )}
        </span>
      </div>

      {/* Right: time + delete */}
      <div className="bb-inbox-row__meta">
        <div className="bb-inbox-row__meta-default">
          {starred && <IconStar size={11} style={{ color: '#f59e0b', fill: '#f59e0b', marginRight: 4 }} />}
          <span className="bb-inbox-row__time" title={absTime}>{timeAgo}</span>
          {onDelete && (
            <button
              className="bb-inbox-row__delete"
              title="Delete"
              onClick={(e) => { e.stopPropagation(); onDelete(message.id); }}
            >
              <IconTrash size={12} />
            </button>
          )}
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

// Inline style fallbacks — guarantees tag background regardless of CSS cascade
const TAG_COLORS: Record<MessageCategory, React.CSSProperties> = {
  action_required: { background: '#E5520E', color: '#fff' },
  fyi: { background: '#4338CA', color: '#fff' },
  conversation: { background: '#BE185D', color: '#fff' },
  automated: { background: '#5B5FC7', color: '#fff' },
  marketing: { background: '#FACC15', color: '#000' },
  spam: { background: '#4B5563', color: '#fff' },
};

function getCategoryLabel(category: MessageCategory): string {
  const labels: Record<MessageCategory, string> = {
    action_required: 'Action Required',
    fyi: 'FYI',
    conversation: 'Personal',
    automated: 'Notification',
    marketing: 'Newsletter',
    spam: 'Spam',
  };
  return labels[category] || category;
}

export default React.memo(InboxTab);
