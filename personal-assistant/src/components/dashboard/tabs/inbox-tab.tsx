'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  IconDots,
  IconSparkles,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
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
  gmail: 'text-red-500',
  outlook: 'text-blue-500',
  whatsapp: 'text-green-500',
  imessage: 'text-green-400',
  asana: 'text-rose-400',
  calendly: 'text-blue-600',
  stripe: 'text-violet-500',
};

// ---------------------------------------------------------------------------
// Text sanitization
// ---------------------------------------------------------------------------

function sanitizeText(text: string): string {
  if (!text) return '';
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
  result = result.replace(/<[^>]*>/g, '');
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
    fullBody: 'Lunch tomorrow? That new ramen place on Crown St just opened\n\nApparently the tonkotsu is insane. 12:30 work?',
    aiSummary: 'Lunch invite for tomorrow at new ramen place on Crown St.',
    category: 'conversation', priority: 'low', significance: 3, contactId: 'c4', contactName: 'Jess Reilly',
    threadStatus: 'waiting_on_you', deduplicatedWith: null,
    receivedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    processedAt: new Date().toISOString(), status: 'unread',
  },
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
// Category badge helpers
// ---------------------------------------------------------------------------

const CATEGORY_VARIANT: Record<MessageCategory, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  action_required: 'destructive',
  fyi: 'secondary',
  conversation: 'default',
  automated: 'outline',
  marketing: 'outline',
  spam: 'outline',
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

  const [activePill, setActivePill] = useState<CategoryPillType>('action');
  const [undoToasts, setUndoToasts] = useState<ToastEntry[]>([]);
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
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
        next.delete(groupKey);
        setCollapsingGroupKey(groupKey);
        if (collapsingGroupRef.current) clearTimeout(collapsingGroupRef.current);
        collapsingGroupRef.current = setTimeout(() => setCollapsingGroupKey(null), 250);
      } else {
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
    setSnoozeOpen(false);
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
      e.preventDefault();
      keyboard.setSelectedIds((prev: Set<string>) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      lastClickedIndexRef.current = index;
    } else {
      lastClickedIndexRef.current = index;
      if (expandedId === id) {
        closeExpanded();
      } else {
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
            <Button
              variant="default"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'settings-connections' } }))}
              className="mt-2"
            >
              Connect a channel
            </Button>
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
      {/* ── Fixed Header: toolbar + filters ── */}
      <div className="shrink-0 z-10 pb-2">
        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <StatPill value={unreadCount} label="unread" active={unreadCount > 0} />
            <Separator orientation="vertical" className="h-4" />
            <StatPill value={actionableCount} label="action needed" active={actionableCount > 0} />
            <Separator orientation="vertical" className="h-4" />
            <StatPill value={waitingCount} label="needs reply" active={waitingCount > 0} />
            <Separator orientation="vertical" className="h-4" />
            <StatPill value={totalCount} label="total" />
          </div>

          <div className="flex items-center gap-2">
            {newMessageAlert && (
              <Button variant="ghost" size="sm" onClick={() => setNewMessageAlert(false)} className="text-emerald-500">
                <span className="relative mr-1.5 flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                New messages
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
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
            >
              <IconRefresh size={13} className={cn(refreshing && 'animate-spin')} data-icon="inline-start" />
              {refreshing ? 'Syncing...' : 'Refresh'}
            </Button>
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
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-0.5">
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
                    <div key={item.groupKey}>
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
                        <div className={cn(
                          'ml-6 border-l border-border pl-2 flex flex-col gap-0.5',
                          isGroupCollapsing && 'pointer-events-none animate-out fade-out-0 duration-200'
                        )}>
                          {item.messages.map((msg) => (
                            <div key={msg.id}>
                              <MessageRow
                                message={msg}
                                index={idx}
                                expanded={expandedId === msg.id || collapsingId === msg.id}
                                onArchive={handleArchive}
                                onDone={handleDone}
                                onDelete={handleDelete}
                                onSnooze={(id) => {
                                  setSnoozeTargetId(id);
                                  setSnoozeOpen(true);
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
                      onSnooze={(id) => {
                        setSnoozeTargetId(id);
                        setSnoozeOpen(true);
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
              {/* Pagination: Load more */}
              {hasMore && !useSeeded && displayed.length > 0 && (
                <Button
                  variant="ghost"
                  className="w-full mt-1"
                  onClick={() => fetchInbox({ loadMore: true })}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <IconRefresh size={13} className="animate-spin" data-icon="inline-start" />
                      Loading...
                    </>
                  ) : (
                    <>Load more {total > messages.length ? `(${total - messages.length} remaining)` : ''}</>
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* ── Floating Bulk Action Bar ── */}
      {keyboard.selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2 fade-in-0 duration-150">
          <span className="text-sm font-medium text-foreground">
            {keyboard.selectedIds.size} selected
          </span>
          <Separator orientation="vertical" className="h-5" />
          <Button variant="outline" size="xs" onClick={handleBulkArchive}>
            <IconArchive size={13} data-icon="inline-start" /> Archive
          </Button>
          <Button variant="outline" size="xs" onClick={handleBulkDone}>
            <IconCircleCheck size={13} data-icon="inline-start" /> Done
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="xs">
                <IconClock size={13} data-icon="inline-start" /> Snooze
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" side="top" align="center">
              <SnoozePickerContent
                onSnooze={(time) => {
                  keyboard.selectedIds.forEach(id => handleSnooze(id, time));
                  clearSelection();
                }}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="xs" onClick={handleBulkSpam}>
            <IconAlertTriangle size={13} data-icon="inline-start" /> Spam
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={clearSelection} aria-label="Clear selection">
            <IconX size={12} />
          </Button>
        </div>
      )}

      {/* ── Snooze Picker Popover (for individual messages) ── */}
      {snoozeTargetId && (
        <Popover open={snoozeOpen} onOpenChange={(o) => { if (!o) { setSnoozeOpen(false); setSnoozeTargetId(null); } }}>
          <PopoverTrigger className="sr-only" />
          <PopoverContent className="w-56 p-1" side="bottom" align="end">
            <SnoozePickerContent
              onSnooze={(time) => handleSnooze(snoozeTargetId, time)}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* ── Undo Toast Stack ── */}
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
// Unified Filter Bar
// ---------------------------------------------------------------------------

const PILL_ORDER: CategoryPillType[] = ['all', 'action', 'waiting', 'direct', 'email', 'notifications', 'billing'];

const CHANNEL_OPTIONS = [
  { value: '', label: 'All channels' },
  { value: 'gmail', label: 'Gmail' },
  { value: 'outlook', label: 'Outlook' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'asana', label: 'Asana' },
  { value: 'calendly', label: 'Calendly' },
  { value: 'stripe', label: 'Stripe' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Any priority' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

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

      <Select value={channelFilter} onValueChange={(v) => onChannelChange(v === '_all' ? '' : v)}>
        <SelectTrigger className="w-auto">
          <SelectValue placeholder="Channel" />
        </SelectTrigger>
        <SelectContent>
          {CHANNEL_OPTIONS.map(o => (
            <SelectItem key={o.value} value={o.value || '_all'}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={priorityFilter} onValueChange={(v) => onPriorityChange(v === '_all' ? '' : v)}>
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
// Undo Toast Stack
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
    <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2 fade-in-0 duration-150"
        >
          <span className="text-sm text-foreground">{toast.message}</span>
          <Button variant="outline" size="xs" onClick={() => onUndo(toast)}>
            Undo
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
            <IconX size={12} />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Snooze Picker Content (reusable for Popover)
// ---------------------------------------------------------------------------

function SnoozePickerContent({ onSnooze }: { onSnooze: (time: string) => void }) {
  const options = getSnoozeOptions();
  return (
    <div className="flex flex-col">
      <span className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Snooze until
      </span>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onSnooze(opt.value)}
          className="flex items-center justify-between gap-4 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-left"
        >
          <span className="flex items-center gap-2">
            <IconClock size={13} className="text-muted-foreground shrink-0" />
            {opt.label}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">{opt.sublabel}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inbox Skeleton
// ---------------------------------------------------------------------------

function InboxSkeleton() {
  return (
    <TabShell>
      <div aria-busy="true" role="status" className="flex flex-col gap-0">
        {/* Toolbar skeleton */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-4">
            {[80, 100, 90, 60].map((w, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Separator orientation="vertical" className="h-4" />}
                <div className="flex items-baseline gap-2">
                  <Skeleton className="h-5 w-6" />
                  <Skeleton className="h-3" style={{ width: w - 24 }} />
                </div>
              </React.Fragment>
            ))}
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-18 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </div>
        {/* Message list skeleton */}
        <div className="flex flex-col gap-1 mt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} size="sm" className={cn('opacity-100', i > 0 && `opacity-${100 - i * 10}`)}>
              <CardContent className="flex items-center gap-3 py-3">
                <Skeleton className="size-8 rounded-full shrink-0" />
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-14 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
                <Skeleton className="h-3 w-8 shrink-0" />
              </CardContent>
            </Card>
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
    <span className="flex items-baseline gap-1.5">
      <span className={cn(
        'text-sm font-semibold tabular-nums',
        active ? 'text-foreground' : 'text-muted-foreground'
      )}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Expanded Message Row — inline content panel
// ---------------------------------------------------------------------------

function generateContextualDraft(message: InboxMessage): string | null {
  if (['automated', 'marketing', 'spam', 'fyi'].includes(message.category)) return null;

  const senderFirstName = (message.contactName || message.senderName || 'there').split(' ')[0];
  const text = ((message.subject || '') + ' ' + (message.fullBody || message.bodyPreview)).toLowerCase();

  if (message.category === 'conversation') {
    if (text.match(/lunch|dinner|coffee|drinks|catch up|hang out|ramen/)) {
      return `Hey ${senderFirstName}! Sounds great, I'm in. Let me check my calendar and confirm the time.`;
    }
    return `Hey ${senderFirstName}, thanks for the message! I'll get back to you on this shortly.`;
  }

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

  return `Hi ${senderFirstName},\n\nThanks for this. I'll look into it and follow up shortly.`;
}

function extractSummaryInline(message: InboxMessage): { summary: string; actionItems: string[]; draftReply: string | null } {
  const body = message.fullBody || message.bodyPreview;
  const text = (message.subject || '') + ' ' + body;
  const actionItems: string[] = [];
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
  const sentences = body.match(/[^.!?\n]+[.!?]+/g);
  const summary = sentences && sentences.length > 0
    ? sentences.slice(0, 3).join(' ').trim()
    : body;
  const draftReply = generateContextualDraft(message);
  return { summary, actionItems: actionItems.slice(0, 3), draftReply };
}

// AI result cache
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

  // AI summary — check cache first
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

  const sender = message.contactName || message.senderName || message.senderEmail || 'Unknown';
  const ChannelIcon = CHANNEL_ICONS[message.channelType] || GmailIcon;
  const channelColorClass = CHANNEL_BRAND_COLORS[message.channelType] || 'text-muted-foreground';
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
    <Card
      ref={expandedRef}
      className={cn(
        'overflow-hidden border-t-0 gap-0 py-0',
        insideGroup ? 'rounded-t-none rounded-b-lg' : 'rounded-t-none rounded-b-xl -mt-1',
        isCollapsing && 'animate-out fade-out-0 slide-out-to-top-1 duration-150 pointer-events-none',
        !isCollapsing && 'animate-in fade-in-0 slide-in-from-top-1 duration-200',
      )}
    >
      {/* Header -- sender + email on one line */}
      <div className="px-5 pt-4">
        <div className="flex items-center gap-2">
          <span className={cn('shrink-0', channelColorClass)}>
            <ChannelIcon size={13} />
          </span>
          <span className="text-sm font-medium text-foreground">
            {sanitizeText(String(sender))}
          </span>
          {message.senderEmail && (
            <>
              <span className="text-muted-foreground">&middot;</span>
              <span className="text-sm text-muted-foreground">
                {String(message.senderEmail)}
              </span>
            </>
          )}
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {fullDate}
          </span>
        </div>
      </div>

      {/* Content area with max-height scroll */}
      <CardContent className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pt-4">
        {/* Subject */}
        {message.subject && (
          <h3 className="text-base font-medium text-foreground leading-snug">
            {sanitizeText(String(message.subject))}
          </h3>
        )}

        {/* Content: crossfade from raw body to AI summary */}
        <div className="relative min-h-5">
          {/* Raw body */}
          <div className={cn(
            'text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words transition-opacity duration-300',
            showSummary && aiResult && !aiLoading && 'absolute inset-x-0 top-0 opacity-0 pointer-events-none',
          )}>
            {sanitizeText(String(message.fullBody || message.bodyPreview || '(No message body)'))}
          </div>

          {/* AI summary */}
          {showSummary && aiResult && !aiLoading && (
            <p className={cn(
              'text-sm text-foreground leading-relaxed',
              aiJustResolved && 'animate-in fade-in-0 duration-300',
            )}>
              {sanitizeText(aiResult.summary)}
            </p>
          )}

          {/* AI Loading shimmer */}
          {showSummary && aiLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-[90%]" />
              <Skeleton className="h-3 w-[75%]" />
              <Skeleton className="h-3 w-[55%]" />
            </div>
          )}
        </div>

        {/* Action items */}
        {aiResult && aiResult.actionItems.length > 0 && (
          <p className={cn(
            'text-sm italic text-muted-foreground leading-relaxed',
            aiJustResolved && 'animate-in fade-in-0 duration-300 delay-150',
          )}>
            {aiResult.actionItems.map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="mx-1.5 text-muted-foreground/50">&middot;</span>}
                {sanitizeText(item)}
              </React.Fragment>
            ))}
          </p>
        )}

        {/* AI Summary badge */}
        {showSummary && aiResult && (
          <div className="flex items-center gap-1.5">
            <IconSparkles className="size-3 text-purple-400" />
            <span className="text-[10px] font-medium text-purple-400 uppercase tracking-wide">AI Summary</span>
          </div>
        )}

        {/* Thread view */}
        {hasThread && threadMessages && (
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              {threadMessages.length} messages in thread
            </span>
            {threadMessages.map((tm) => {
              if (!tm || !tm.id) return null;
              const isExpTh = expandedThreadIds.has(tm.id);
              const isLatest = tm.id === latestThreadId;
              const tmSender = tm.senderName || 'Unknown';
              return (
                <Card key={tm.id} size="sm" className={cn(
                  'py-0 gap-0 overflow-hidden',
                  isLatest ? 'ring-1 ring-border' : 'ring-1 ring-border/50',
                )}>
                  <div
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 select-none',
                      !isLatest && 'cursor-pointer hover:bg-muted/50',
                    )}
                    onClick={() => !isLatest && toggleThread(tm.id)}
                  >
                    <Avatar size="sm">
                      <AvatarFallback className={tm.isSelf ? 'bg-primary/20 text-primary' : ''}>
                        {String(tmSender[0] || '?').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground shrink-0">
                      {tm.isSelf ? 'You' : tmSender}
                    </span>
                    {!isExpTh && !isLatest && (
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {sanitizeText(String(tm.bodyPreview || '').slice(0, 70))}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0 ml-auto">
                      {formatTimeAgo(tm.receivedAt)}
                    </span>
                    {!isLatest && (
                      <span className="text-muted-foreground shrink-0">
                        {isExpTh ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />}
                      </span>
                    )}
                  </div>
                  {(isExpTh || isLatest) && (
                    <div className="px-3 pb-3 pl-10 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                      {sanitizeText(String(tm.bodyPreview || ''))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Chat-style reply composer */}
      <div className="px-5 pb-4 pt-2">
        <div className="rounded-2xl border border-input bg-muted/30 px-4 py-1">
          <div className="relative min-h-8">
            {/* Ghost draft */}
            {ghostVisible && !replyText && aiResult?.draftReply && (
              <div
                aria-hidden="true"
                className={cn(
                  'py-2 text-sm italic text-muted-foreground leading-relaxed whitespace-pre-wrap pointer-events-none max-h-[200px] overflow-hidden',
                  aiJustResolved && 'animate-in fade-in-0 duration-300',
                )}
              >
                {sanitizeText(aiResult.draftReply)}
              </div>
            )}
            <textarea
              ref={textareaRef}
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
              className={cn(
                'w-full bg-transparent border-none outline-none text-sm text-foreground leading-relaxed resize-none min-h-8 max-h-[200px] py-2 placeholder:text-muted-foreground',
                ghostVisible && !replyText && aiResult?.draftReply && 'absolute inset-0 z-10',
              )}
            />
          </div>
          {/* Bottom row: hint left, send button right */}
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs text-muted-foreground">
              {ghostVisible && !replyText && aiResult?.draftReply ? (
                <><kbd className="rounded border border-border bg-background px-1 py-0.5 text-[10px] font-mono">Tab</kbd> to use suggested reply</>
              ) : (
                <><kbd className="rounded border border-border bg-background px-1 py-0.5 text-[10px] font-mono">Cmd+Enter</kbd> to send</>
              )}
            </span>
            <Button
              variant="default"
              size="icon-xs"
              onClick={handleSendReply}
              disabled={!replyText.trim()}
              className={cn(
                'rounded-full',
                !replyText.trim() && 'opacity-25',
              )}
            >
              <IconArrowUp size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* Icon-only action bar */}
      <div className="flex items-center gap-1 px-5 pb-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={() => textareaRef.current?.focus()}>
                <IconArrowBackUp size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={() => onArchive(message.id)}>
                <IconArchive size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Archive</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={() => onDone(message.id)}>
                <IconCircleCheck size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Done</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={() => {}}>
                <IconClock size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Snooze</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={() => {}}>
                <IconArrowForwardUp size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forward</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive" onClick={() => onSpam(message.id)}>
                <IconAlertTriangle size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Spam</TooltipContent>
          </Tooltip>
          <div className="flex-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={onClose}>
                <IconX size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Attachment Pills (structural stub)
// ---------------------------------------------------------------------------

function AttachmentPills({ attachments }: { attachments?: { name: string; size: string; type: string }[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="flex gap-2 flex-wrap">
      {attachments.map((att, i) => (
        <Badge key={i} variant="outline" className="cursor-pointer gap-2 h-8 px-2.5">
          <span className="max-w-[180px] truncate">{att.name}</span>
          <span className="text-muted-foreground text-xs">{att.size}</span>
        </Badge>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group Row
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
  const channelColorClass = CHANNEL_BRAND_COLORS[item.channelType] || 'text-muted-foreground';
  const newestMsg = item.messages[0];
  const preview = newestMsg?.aiSummary || newestMsg?.subject || newestMsg?.bodyPreview || '';
  const relTime = formatTimeAgo(item.newestAt);
  const absTime = new Date(item.newestAt).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors',
        'hover:bg-muted/50',
        focused && 'bg-muted ring-1 ring-border',
        selected && 'bg-primary/5 ring-1 ring-primary/20',
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      {/* Chevron */}
      <IconChevronDown
        size={13}
        className={cn(
          'shrink-0 text-muted-foreground transition-transform duration-200',
          !expanded && '-rotate-90',
        )}
      />

      {/* Channel icon */}
      <div className={cn('shrink-0 flex size-7 items-center justify-center rounded-md bg-muted', channelColorClass)}>
        <ChannelIcon size={14} />
      </div>

      {/* Count badge */}
      <Badge variant="secondary" className="shrink-0 tabular-nums">
        {item.messages.length}
      </Badge>

      {/* Label */}
      <span className="text-sm font-medium text-foreground shrink-0">
        {item.label}
      </span>

      {/* Preview */}
      <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
        {sanitizeText(String(preview))}
      </span>

      {/* Right side: unread dot + time + delete */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {item.hasUnread && (
          <span className="size-1.5 rounded-full bg-blue-500 shrink-0" />
        )}
        <span className="text-xs text-muted-foreground whitespace-nowrap" title={absTime}>
          {relTime}
        </span>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover:opacity-100 hover:opacity-100 text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label="Delete all"
          >
            <IconTrash size={12} />
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Row
// ---------------------------------------------------------------------------

function MessageRow({
  message, onArchive, onDone, onSnooze, onReply, onStar, onRowClick, onDelete, index, focused, selected, starred, expanded, insideGroup,
}: {
  message: InboxMessage;
  onArchive?: (id: string) => void;
  onDone?: (id: string) => void;
  onSnooze?: (id: string) => void;
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
  const channelColorClass = CHANNEL_BRAND_COLORS[message.channelType] || 'text-muted-foreground';
  const isUnread = message.status === 'unread';
  const timeAgo = formatTimeAgo(message.receivedAt);
  const absTime = new Date(message.receivedAt).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
  const sender = message.contactName || message.senderName || message.senderEmail || 'Unknown';

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
      className={cn(
        'group/row flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors',
        'hover:bg-muted/50',
        focused && 'bg-muted ring-1 ring-border',
        selected && 'bg-primary/5 ring-1 ring-primary/20',
        expanded && 'rounded-b-none bg-muted/30',
        insideGroup && 'py-2',
      )}
      onClick={(e) => onRowClick?.(message.id, index, e)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick?.(message.id, index, e as unknown as React.MouseEvent); } }}
    >
      {/* Avatar with channel badge overlay */}
      <div className="relative shrink-0">
        <Avatar size={insideGroup ? 'sm' : 'default'}>
          {avatar?.url && <AvatarImage src={avatar.url} alt={sender} />}
          <AvatarFallback>{sender[0]?.toUpperCase() || '?'}</AvatarFallback>
        </Avatar>
        <div className={cn(
          'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-background',
          insideGroup ? 'size-3' : 'size-3.5',
          channelColorClass,
        )}>
          <ChannelIcon size={insideGroup ? 7 : 9} />
        </div>
      </div>

      {/* Sender name */}
      <span className={cn(
        'text-sm shrink-0 truncate max-w-[120px]',
        isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80',
      )}>
        {String(sender || '')}
      </span>

      {/* Category tag */}
      <Badge variant={CATEGORY_VARIANT[message.category]} className="shrink-0 text-[10px] uppercase tracking-wide">
        {getCategoryLabel(message.category)}
      </Badge>

      {/* Subject + preview */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {message.subject && (
          <span className={cn(
            'text-sm truncate',
            isUnread ? 'font-medium text-foreground' : 'text-foreground/80',
          )}>
            {String(message.subject || '')}
            {message.threadCount && message.threadCount > 1 && (
              <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                ({message.threadCount})
              </span>
            )}
          </span>
        )}
        <span className="text-xs text-muted-foreground truncate">
          {message.aiSummary
            ? sanitizeText(String(message.aiSummary || ''))
            : sanitizeText(String(message.bodyPreview || ''))}
        </span>
      </div>

      {/* Right: star + time + actions */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        {starred && <IconStar size={11} className="text-amber-500 fill-amber-500" />}
        <span className="text-xs text-muted-foreground whitespace-nowrap" title={absTime}>
          {timeAgo}
        </span>

        {/* Context menu on hover */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 group-hover/row:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
              aria-label="Actions"
            >
              <IconDots size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onArchive?.(message.id)}>
              <IconArchive size={14} /> Archive
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDone?.(message.id)}>
              <IconCircleCheck size={14} /> Mark Done
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze?.(message.id)}>
              <IconClock size={14} /> Snooze
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStar?.(message.id)}>
              <IconStar size={14} /> {starred ? 'Unstar' : 'Star'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReply?.(message.id)}>
              <IconArrowBackUp size={14} /> Reply
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete?.(message.id)}>
              <IconTrash size={14} /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
