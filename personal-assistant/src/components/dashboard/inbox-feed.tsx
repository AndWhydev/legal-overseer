'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useState as useLocalState } from 'react';
import {
  IconInbox,
  IconCircleCheck,
  IconLayoutSidebarRightCollapse,
} from '@tabler/icons-react';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { useSeedData } from '@/hooks/use-seed-data';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle, EmptyMedia } from '@/components/ui/empty';

interface InboxMessage {
  id: string;
  sender: string;
  senderName?: string;
  subject: string | null;
  channel?: string | null;
  channelType?: string | null;
  received_at: string;
  receivedAt?: string;
  significance: number;
  processed: boolean;
  aiSummary?: string | null;
  bodyPreview?: string;
  category?: string | null;
  priority?: string | null;
}

interface InboxFeedProps {
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function priorityColor(msg: InboxMessage): string {
  if (msg.priority === 'critical') return 'text-destructive';
  if (msg.priority === 'high') return 'text-amber-500';
  return 'text-primary';
}

// Channel icon components (SVG brand icons - kept as SVG since these are brand-specific)
function GmailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
    </svg>
  );
}

function OutlookIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 7.387v10.478c0 .23-.08.424-.238.576a.806.806 0 01-.588.236h-8.108v-8.07l2.727 1.903.312.125a.39.39 0 00.32-.118l.61-.595a.39.39 0 00.124-.3.4.4 0 00-.164-.32L15.2 8.417h7.974c.234 0 .434.082.59.23.157.148.236.344.236.58v.16zM14.934 24H1.098A1.1 1.1 0 010 22.902V6.513a1.1 1.1 0 011.098-1.098h3.488V1.098A1.1 1.1 0 015.684 0h8.152a1.1 1.1 0 011.098 1.098v4.317h3.488a1.1 1.1 0 011.098 1.098v4.164h-5.586V24zM4.138 16.32c0 1.023.273 1.828.82 2.414.546.586 1.273.879 2.18.879.91 0 1.636-.293 2.18-.88.545-.585.82-1.39.82-2.413 0-1.016-.275-1.816-.824-2.4-.55-.585-1.274-.877-2.176-.877-.902 0-1.63.293-2.18.88-.546.586-.82 1.386-.82 2.398zm2.305-3.545c1.336 0 2.395.387 3.176 1.164.781.777 1.172 1.82 1.172 3.128 0 1.297-.39 2.332-1.168 3.11-.777.776-1.84 1.164-3.188 1.164-1.328 0-2.38-.387-3.152-1.16-.773-.774-1.16-1.813-1.16-3.114 0-1.313.39-2.356 1.172-3.132.781-.777 1.832-1.16 3.148-1.16z" />
    </svg>
  );
}

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function IMessageIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.916 0C5.335 0 0 4.434 0 9.904c0 3.098 1.746 5.862 4.479 7.63l-.727 2.905a.5.5 0 00.726.543l3.546-2.012c1.224.365 2.534.566 3.892.566 6.581 0 11.916-4.434 11.916-9.904-.004-5.466-5.339-9.632-11.916-9.632z" />
    </svg>
  );
}

function AsanaIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.78 12.653a5.22 5.22 0 100 10.44 5.22 5.22 0 000-10.44zm-13.56 0a5.22 5.22 0 100 10.44 5.22 5.22 0 000-10.44zM12 .907a5.22 5.22 0 100 10.44 5.22 5.22 0 000-10.44z" />
    </svg>
  );
}

function StripeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
    </svg>
  );
}

function SlackIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 3a2 2 0 114 0 2 2 0 01-4 0zm16 16a2 2 0 11-4 0 2 2 0 014 0zM5 13a2 2 0 114 0 2 2 0 01-4 0zm7-10a2 2 0 114 0 2 2 0 01-4 0zm0 20a2 2 0 114 0 2 2 0 01-4 0zm7-10a2 2 0 114 0 2 2 0 01-4 0z" />
    </svg>
  );
}

function CalendarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 2a2 2 0 012 2v2h6V4a2 2 0 112 2v2h3a2 2 0 012 2v11a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h3V4a2 2 0 012-2z" />
    </svg>
  );
}

function SMSIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

const CHANNEL_ICONS: Record<string, React.FC<{ size?: number }>> = {
  gmail: GmailIcon,
  outlook: OutlookIcon,
  whatsapp: WhatsAppIcon,
  imessage: IMessageIcon,
  asana: AsanaIcon,
  stripe: StripeIcon,
  slack: SlackIcon,
  calendly: CalendarIcon,
  sms: SMSIcon,
};

// Minimal abstract "orbit" icon -- represents autonomous agentic processing
function AutopilotIcon({ size = 14, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="2.5" fill={active ? 'url(#ap-grad)' : 'currentColor'} opacity={active ? 1 : 0.8} />
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1" opacity={0.35} strokeDasharray="2 3" >
        {active && <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="4s" repeatCount="indefinite" />}
      </circle>
      <circle cx="8" cy="8" r="7.2" stroke="currentColor" strokeWidth="0.6" opacity={0.15} strokeDasharray="1.5 4" >
        {active && <animateTransform attributeName="transform" type="rotate" from="360 8 8" to="0 8 8" dur="6s" repeatCount="indefinite" />}
      </circle>
      {active && (
        <defs>
          <radialGradient id="ap-grad" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#7c3aed" />
          </radialGradient>
        </defs>
      )}
    </svg>
  );
}

export function InboxFeed({ isCollapsed = false, onCollapsedChange }: InboxFeedProps) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [autopilotActive, setAutopilotActive] = useLocalState(false);
  const initialLoadDone = useRef(false);
  const seed = useSeedData();

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/inbox?limit=30');
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? data ?? []);
      }
    } catch {
      // silently fail -- feed is non-critical
    }
  }, []);

  useEffect(() => {
    fetchMessages().then(() => { initialLoadDone.current = true; });
  }, [fetchMessages]);

  // Realtime: new messages trigger refetch + slide-in animation
  useRealtimeSubscription('channel_messages', { event: 'INSERT' }, useCallback(() => {
    fetchMessages().then(() => {
      if (!initialLoadDone.current) return;
      setMessages(prev => {
        if (prev.length > 0) {
          setNewIds(ids => {
            const next = new Set(ids);
            next.add(prev[0].id);
            setTimeout(() => setNewIds(s => { const n = new Set(s); n.delete(prev[0].id); return n; }), 500);
            return next;
          });
        }
        return prev;
      });
    });
  }, [fetchMessages]));

  // Use seed data when active, then filter out noise
  const rawMessages = seed.active ? (seed.data?.inboxMessages ?? messages) : messages;
  const filteredMessages = rawMessages
    .filter((m: InboxMessage) =>
      m.category !== 'spam' &&
      m.category !== 'marketing' &&
      (m.category === 'automated' || m.significance >= 5)
    );

  // Lightweight always-collapsed grouping for sidebar
  type FeedItem =
    | { type: 'individual'; message: InboxMessage }
    | { type: 'group'; label: string; channelType: string; count: number; preview: string; time: string; hasUnread: boolean };

  const feedItems: FeedItem[] = (() => {
    const groupMap = new Map<string, InboxMessage[]>();
    const order: (string | InboxMessage)[] = [];

    for (const msg of filteredMessages) {
      const cat = msg.category || '';
      let key: string | null = null;
      if (cat === 'automated') key = `auto:${msg.channelType || msg.channel || 'unknown'}`;
      else if (cat === 'fyi' || cat === 'conversation') key = `contact:${msg.senderName || msg.sender || 'unknown'}`;

      if (!key || cat === 'action_required') { order.push(msg); continue; }
      if (!groupMap.has(key)) { groupMap.set(key, []); order.push(key); }
      groupMap.get(key)!.push(msg);
    }

    const items: FeedItem[] = [];
    for (const entry of order) {
      if (typeof entry === 'string') {
        const msgs = groupMap.get(entry)!;
        if (msgs.length < 2) {
          items.push({ type: 'individual', message: msgs[0] });
        } else {
          msgs.sort((a, b) => new Date(b.receivedAt || b.received_at).getTime() - new Date(a.receivedAt || a.received_at).getTime());
          const newest = msgs[0];
          const ch = newest.channelType || newest.channel || 'gmail';
          let label: string;
          if (entry.startsWith('auto:')) {
            const n: Record<string, string> = { asana: 'Asana', stripe: 'Stripe', calendly: 'Calendly', gmail: 'Gmail', outlook: 'Outlook', slack: 'Slack' };
            label = n[entry.slice(5)] || entry.slice(5);
          } else {
            label = newest.senderName || newest.sender || 'Unknown';
          }
          items.push({ type: 'group', label, channelType: ch, count: msgs.length, preview: newest.aiSummary || newest.bodyPreview || newest.subject || '', time: newest.receivedAt || newest.received_at, hasUnread: msgs.some(m => !m.processed) });
        }
      } else {
        items.push({ type: 'individual', message: entry });
      }
    }

    items.sort((a, b) => {
      const aT = a.type === 'group' ? a.time : (a.message.receivedAt || a.message.received_at);
      const bT = b.type === 'group' ? b.time : (b.message.receivedAt || b.message.received_at);
      return new Date(bT).getTime() - new Date(aT).getTime();
    });

    return items.slice(0, 15);
  })();

  const unreadCount = filteredMessages.filter((m: InboxMessage) => !m.processed).length;

  const navigateToInbox = () => {
    window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'inbox' } }));
  };

  return (
    <Card className="flex flex-col h-full overflow-hidden py-0 gap-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <IconInbox className="size-4 text-muted-foreground" />
        <button
          onClick={navigateToInbox}
          className="text-sm font-medium text-foreground hover:opacity-80 transition-opacity"
          role="button"
          tabIndex={0}
        >
          Inbox
        </button>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="text-xs px-1.5 py-0 min-w-5 justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
        <div className="ml-auto flex gap-1 items-center">
          <Button
            variant={autopilotActive ? 'outline' : 'ghost'}
            size="icon-xs"
            onClick={() => {
              setAutopilotActive(prev => !prev);
              if (!autopilotActive) {
                fetch('/api/agent/triage', { method: 'POST' }).catch(() => {});
              }
            }}
            title={autopilotActive ? 'Autopilot active' : 'Enable autopilot'}
            aria-label={autopilotActive ? 'Disable autopilot' : 'Enable autopilot'}
            className={autopilotActive ? 'border-purple-400/40 bg-purple-500/10 text-purple-500' : ''}
          >
            <AutopilotIcon size={14} active={autopilotActive} />
          </Button>
          {onCollapsedChange && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onCollapsedChange(true)}
              title="Collapse inbox"
              aria-label="Collapse inbox"
            >
              <IconLayoutSidebarRightCollapse className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto py-1">
        {feedItems.length === 0 && (
          <Empty className="min-h-[200px]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconCircleCheck className="size-4" />
              </EmptyMedia>
              <EmptyTitle>Inbox zero -- all clear</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {feedItems.map((item, i) => {
          if (item.type === 'group') {
            const IconComponent = CHANNEL_ICONS[item.channelType.toLowerCase()] || GmailIcon;
            return (
              <button
                key={`grp-${i}`}
                onClick={navigateToInbox}
                className="flex items-start gap-3 w-full px-4 py-3 text-left transition-colors hover:bg-accent/50"
              >
                <div className="shrink-0 pt-0.5 text-muted-foreground">
                  <IconComponent size={16} />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate">
                      {item.label}
                      <Badge variant="destructive" className="ml-2 text-[10px] px-1 py-0 min-w-4 justify-center align-middle">
                        {item.count}
                      </Badge>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground pl-2">
                      {timeAgo(item.time)}
                    </span>
                  </div>
                  {item.preview && (
                    <span className="text-xs text-muted-foreground truncate">
                      {String(item.preview)}
                    </span>
                  )}
                </div>
                {item.hasUnread && (
                  <div className="size-1.5 rounded-full bg-primary shrink-0 mt-2" />
                )}
              </button>
            );
          }

          const msg = item.message;
          const channelType = msg.channelType || msg.channel || 'gmail';
          const IconComponent = CHANNEL_ICONS[channelType.toLowerCase()] || GmailIcon;
          const messageTime = msg.receivedAt || msg.received_at;
          const preview = msg.aiSummary || msg.bodyPreview || msg.subject || '';

          return (
            <button
              key={msg.id}
              onClick={navigateToInbox}
              className={`flex items-start gap-3 w-full px-4 py-3 text-left transition-colors hover:bg-accent/50 ${msg.processed ? 'opacity-60' : ''} ${newIds.has(msg.id) ? 'animate-inbox-slide-in' : ''}`}
            >
              <div className="shrink-0 pt-0.5 text-muted-foreground">
                <IconComponent size={16} />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
                    {String(msg.subject || '(no subject)')}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground pl-2">
                    {timeAgo(messageTime)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground truncate">
                  {String(msg.sender || msg.senderName || 'Unknown')}
                </span>
                {preview && (
                  <span className="text-xs text-muted-foreground/70 truncate">
                    {String(preview || '')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {msg.processed && <IconCircleCheck className="size-3 text-green-500 opacity-70" />}
                <div className={`size-1.5 rounded-full shrink-0 ${priorityColor(msg)} bg-current`} />
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
