'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  IconX,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArchive,
  IconCircleCheck,
  IconAlertTriangle,
  IconSparkles,
  IconChevronDown,
  IconChevronRight,
  IconChecklist,
  IconSend,
} from '@tabler/icons-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { resolveAvatarSync, resolveAvatar, type AvatarResult } from '@/lib/avatar/resolver';

// Types

type MessageCategory = 'action_required' | 'fyi' | 'conversation' | 'automated' | 'marketing' | 'spam';
type ThreadStatus = 'waiting_on_you' | 'waiting_on_them' | 'resolved' | 'new';

export interface InboxMessage {
  id: string;
  channelType: string;
  senderName: string | null;
  senderEmail: string | null;
  subject: string | null;
  bodyPreview: string;
  category: MessageCategory;
  priority: string;
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

export interface ThreadMessageItem {
  id: string;
  senderName: string;
  receivedAt: string;
  bodyPreview: string;
  isLatest?: boolean;
  isSelf?: boolean;
}

export interface InboxDrawerProps {
  message: InboxMessage | null;
  open: boolean;
  onClose: () => void;
  onArchive: (id: string) => void;
  onDone: (id: string) => void;
  onReply: (id: string, body: string) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  threadMessages?: ThreadMessageItem[];
}

// Channel Icons (SVG brand icons)

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

function CalendarIconSvg({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

const CHANNEL_ICONS: Record<string, React.FC<{ size?: number }>> = {
  gmail: GmailIcon,
  outlook: OutlookIcon,
  whatsapp: WhatsAppIcon,
  imessage: IMessageIcon,
  asana: AsanaIcon,
  calendly: CalendarIconSvg,
  stripe: StripeIcon,
};

// Helper Functions

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

function getCategoryVariant(category: MessageCategory): 'default' | 'secondary' | 'destructive' | 'outline' {
  const variants: Record<MessageCategory, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    action_required: 'destructive',
    fyi: 'secondary',
    conversation: 'default',
    automated: 'outline',
    marketing: 'outline',
    spam: 'outline',
  };
  return variants[category] || 'outline';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// AI Summary

interface AiSummaryResult {
  summary: string;
  actionItems: string[];
  draftReply: string;
}

function extractSummary(message: InboxMessage): AiSummaryResult {
  const text = (message.subject || '') + ' ' + message.bodyPreview;
  const actionItems: string[] = [];

  const actionMatch = text.match(/want[s]?\s+(?:the\s+)?([^,.!?]{10,60})/i);
  if (actionMatch) actionItems.push(actionMatch[0].trim());

  const deadlineMatch = text.match(/(due|deadline|by|end of)\s+([^,.!?]{3,40})/i);
  if (deadlineMatch) actionItems.push(`Deadline mentioned: ${deadlineMatch[0].trim()}`);

  if (text.match(/urgent|asap|immediately|critical|error|crash|spike|500/i)) {
    actionItems.push('Urgent -- requires immediate attention');
  }

  if (text.match(/assigned|you have been|please review|please confirm/i)) {
    actionItems.push('Action assigned to you');
  }

  const summary = message.bodyPreview.length > 120
    ? message.bodyPreview.slice(0, 120).trim() + '...'
    : message.bodyPreview;

  const senderFirstName = (message.contactName || message.senderName || 'there').split(' ')[0];
  const draftReply = message.category === 'action_required'
    ? `Hi ${senderFirstName},\n\nThanks for reaching out. I'll look into this and get back to you shortly.\n\nBest regards`
    : `Hi ${senderFirstName},\n\nThank you for the update. I'll review and let you know if I have any questions.\n\nBest regards`;

  return { summary, actionItems: actionItems.slice(0, 3), draftReply };
}

function AiSummaryPanel({
  message,
  onCreateTask,
  onDraftReply,
}: {
  message: InboxMessage;
  onCreateTask: (data: { subject: string; description: string }) => void;
  onDraftReply: (text: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AiSummaryResult | null>(null);

  useEffect(() => {
    setLoading(true);
    setResult(null);
    const timer = setTimeout(() => {
      setResult(extractSummary(message));
      setLoading(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [message.id]);

  return (
    <Card className="border-purple-500/30 bg-purple-500/5 py-4 gap-3">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <IconSparkles className="size-3.5 text-purple-400 shrink-0" />
          <span className="text-xs font-medium text-purple-400 tracking-wide">AI Summary</span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-[90%] bg-purple-500/10" />
            <Skeleton className="h-3 w-[75%] bg-purple-500/10" />
            <Skeleton className="h-3 w-[55%] bg-purple-500/10" />
          </div>
        ) : result ? (
          <>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {result.summary}
            </p>

            {result.actionItems.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs">
                {result.actionItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-purple-400/90">
                    <span className="text-purple-600 mt-0.5 shrink-0">&rsaquo;</span>
                    {item}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="xs"
                className="border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
                onClick={() => onCreateTask({
                  subject: message.subject || message.bodyPreview.slice(0, 60),
                  description: message.bodyPreview,
                })}
              >
                <IconChecklist className="size-3" data-icon="inline-start" /> Create Task
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => onDraftReply(result.draftReply)}
              >
                <IconArrowBackUp className="size-3" data-icon="inline-start" /> Draft Reply
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

// Thread View

function ThreadView({
  messages,
  onFocusReply,
}: {
  messages: ThreadMessageItem[];
  onFocusReply: () => void;
}) {
  if (!messages || messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No thread messages available
      </p>
    );
  }

  const latestId = messages[messages.length - 1]?.id;
  const [expanded, setExpanded] = useState<Set<string>>(new Set([latestId]));

  const toggle = (id: string) => {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {messages.length} messages in thread
      </span>

      {messages.map((msg) => {
        if (!msg || !msg.id) return null;

        const isExpanded = expanded.has(msg.id);
        const isLatest = msg.id === latestId;
        const senderName = msg.senderName || 'Unknown';

        return (
          <Card key={msg.id} className={`py-0 gap-0 overflow-hidden ${isLatest ? 'border-border' : 'border-border/50'}`}>
            <div
              className={`flex items-center gap-2 px-3 py-2.5 ${isLatest ? '' : 'cursor-pointer'} select-none`}
              onClick={() => !isLatest && toggle(msg.id)}
            >
              <Avatar size="sm">
                <AvatarFallback className={msg.isSelf ? 'bg-primary/20 text-primary' : ''}>
                  {String(senderName[0] || '?').toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <span className="text-sm font-medium text-foreground shrink-0">
                {msg.isSelf ? 'You' : senderName}
              </span>

              {!isExpanded && !isLatest && (
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {String(msg.bodyPreview).slice(0, 70)}
                </span>
              )}

              <span className="text-xs text-muted-foreground shrink-0 ml-auto">
                {formatTimeAgo(msg.receivedAt)}
              </span>

              {!isLatest && (
                <span className="text-muted-foreground shrink-0">
                  {isExpanded ? <IconChevronDown className="size-3" /> : <IconChevronRight className="size-3" />}
                </span>
              )}
            </div>

            {(isExpanded || isLatest) && (
              <div className="px-3 pb-3 pl-10 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                {String(msg.bodyPreview)}
              </div>
            )}
          </Card>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        className="mt-1 border-dashed text-muted-foreground"
        onClick={onFocusReply}
      >
        <IconArrowBackUp className="size-3" data-icon="inline-start" /> Reply to thread...
      </Button>
    </div>
  );
}

// Main Component

export default function InboxDrawer({
  message,
  open,
  onClose,
  onArchive,
  onDone,
  onReply,
  onNavigate,
  threadMessages,
}: InboxDrawerProps) {
  const [replyText, setReplyText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset reply text when message changes
  useEffect(() => {
    setReplyText('');
  }, [message?.id]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open || !message) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      if (tag === 'TEXTAREA' && e.key !== 'Escape' && !(e.metaKey || e.ctrlKey)) return;

      switch (e.key) {
        case 'Escape': e.preventDefault(); onClose(); break;
        case 'j': e.preventDefault(); onNavigate('next'); break;
        case 'k': e.preventDefault(); onNavigate('prev'); break;
        case 'e': e.preventDefault(); onArchive(message.id); break;
        case 'd': e.preventDefault(); onDone(message.id); break;
        case 'r': e.preventDefault(); textareaRef.current?.focus(); break;
        case 'Enter':
          if ((e.metaKey || e.ctrlKey) && tag === 'TEXTAREA') {
            e.preventDefault();
            handleSendReply();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, message, onClose, onNavigate, onArchive, onDone]);

  const handleSendReply = () => {
    if (message && replyText.trim()) {
      onReply(message.id, replyText);
      setReplyText('');
    }
  };

  // Avatar resolution
  const sender = message ? (message.contactName || message.senderName || message.senderEmail || 'Unknown') : '';
  const email = message?.senderEmail ?? null;
  const syncAvatar: AvatarResult = sender ? resolveAvatarSync(sender, email) : { url: null, type: 'initials', initials: '?', color: '#666' };
  const [avatar, setAvatar] = React.useState<AvatarResult>(syncAvatar);

  React.useEffect(() => {
    if (!email && !sender) return;
    let cancelled = false;
    resolveAvatar(email, sender, null).then((result) => {
      if (!cancelled) setAvatar(result);
    });
    return () => { cancelled = true; };
  }, [email, sender]);

  if (!message) return null;

  const ChannelIcon = CHANNEL_ICONS[message.channelType] || GmailIcon;
  const showSummary = message.significance >= 5;
  const hasThread = threadMessages && threadMessages.length > 1;
  const threadCount = threadMessages?.length ?? message.threadCount;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl flex flex-col gap-0 p-0"
        showCloseButton={false}
      >
        {/* Header: Actions + Close */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0 gap-3">
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => textareaRef.current?.focus()} title="Reply (R)">
              <IconArrowBackUp className="size-3.5" data-icon="inline-start" /> Reply
            </Button>
            <Button variant="outline" size="sm" onClick={() => {}} title="Forward (F)">
              <IconArrowForwardUp className="size-3.5" data-icon="inline-start" /> Forward
            </Button>
            <Button variant="outline" size="sm" onClick={() => onArchive(message.id)} title="Archive (E)">
              <IconArchive className="size-3.5" data-icon="inline-start" /> Archive
            </Button>
            <Button variant="outline" size="sm" onClick={() => onDone(message.id)} title="Done (D)">
              <IconCircleCheck className="size-3.5" data-icon="inline-start" /> Done
            </Button>
            <Button variant="destructive" size="sm" onClick={() => {}} title="Spam (!)">
              <IconAlertTriangle className="size-3.5" data-icon="inline-start" /> Spam
            </Button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {threadCount && threadCount > 1 && (
              <Badge variant="secondary" className="text-xs">
                {threadCount} messages
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close drawer"
            >
              <IconX className="size-4" />
            </Button>
          </div>
        </div>

        {/* Meta: Sender, Subject, Badges */}
        <div className="px-6 py-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative size-9 shrink-0">
              <Avatar size="lg">
                {avatar?.url && <AvatarImage src={avatar.url} alt={sender} />}
                <AvatarFallback>{sender[0]?.toUpperCase() || '?'}</AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-background flex items-center justify-center text-muted-foreground">
                <ChannelIcon size={9} />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-base font-medium text-foreground truncate">
                {String(sender || '')}
              </div>
              {message.senderEmail && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {String(message.senderEmail || '')}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground shrink-0 text-right">
              {formatDate(message.receivedAt)}
            </div>
          </div>

          {message.subject && (
            <h2 className="text-base font-medium text-foreground mb-2.5 leading-snug">
              {String(message.subject || '')}
            </h2>
          )}

          <div className="flex gap-2 flex-wrap">
            <Badge variant={getCategoryVariant(message.category)} className="uppercase tracking-wide text-[10px]">
              {getCategoryLabel(message.category)}
            </Badge>

            {message.threadStatus && (
              <Badge
                variant={message.threadStatus === 'waiting_on_you' ? 'default' : 'secondary'}
              >
                {message.threadStatus === 'waiting_on_you' ? 'Waiting on you' :
                 message.threadStatus === 'waiting_on_them' ? 'Waiting on them' :
                 message.threadStatus === 'new' ? 'New' : 'Resolved'}
              </Badge>
            )}
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4 text-sm text-foreground leading-relaxed">
          {showSummary && (
            <AiSummaryPanel
              message={message}
              onCreateTask={(data) => {
                window.dispatchEvent(new CustomEvent('bb:create-task', { detail: data }));
              }}
              onDraftReply={(text) => {
                setReplyText(text);
                setTimeout(() => textareaRef.current?.focus(), 50);
              }}
            />
          )}

          {hasThread && threadMessages && threadMessages.length > 0 ? (
            <ThreadView messages={threadMessages} onFocusReply={() => textareaRef.current?.focus()} />
          ) : (
            <div className="whitespace-pre-wrap break-words font-sans">
              {String(message.bodyPreview || '(No message body)')}
            </div>
          )}
        </div>

        {/* Reply Composer */}
        <div className="px-5 py-4 border-t border-border shrink-0">
          <div className="flex items-end gap-2 rounded-xl border border-input bg-muted/30 px-3 py-2">
            <textarea
              ref={textareaRef}
              value={replyText}
              onChange={(e) => {
                setReplyText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSendReply();
                }
              }}
              placeholder="Reply... (Cmd+Enter to send)"
              className="flex-1 bg-transparent border-none outline-none text-sm text-foreground font-inherit leading-normal resize-none min-h-8 max-h-[200px] w-full placeholder:text-muted-foreground"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleSendReply}
              disabled={!replyText.trim()}
              className={replyText.trim() ? 'text-foreground' : 'text-muted-foreground opacity-40'}
            >
              <IconSend className="size-3.5" />
            </Button>
          </div>
          {replyText && (
            <div className="text-xs text-muted-foreground mt-1.5 pl-3">
              <kbd className="px-1 py-0.5 rounded border border-border bg-background text-[10px] font-mono">Cmd+Enter</kbd> to send
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
