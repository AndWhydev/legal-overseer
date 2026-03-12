'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Reply,
  Forward,
  Archive,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { resolveAvatarSync, resolveAvatar, type AvatarResult } from '@/lib/avatar/resolver';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type MessageCategory = 'actionable' | 'informational' | 'spam' | 'personal';
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
  deduplicatedWith: string | null;
  receivedAt: string;
  processedAt: string | null;
  status: string;
}

export interface InboxDrawerProps {
  message: InboxMessage | null;
  open: boolean;
  onClose: () => void;
  onArchive: (id: string) => void;
  onDone: (id: string) => void;
  onReply: (id: string, body: string) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Icons & Colors
// ─────────────────────────────────────────────────────────────────────────────

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

function CalendarIcon({ size = 15 }: { size?: number }) {
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
  calendly: CalendarIcon,
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

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function getCategoryLabel(category: MessageCategory): string {
  const labels: Record<MessageCategory, string> = {
    actionable: 'Priority',
    personal: 'Personal',
    informational: 'Updates',
    spam: 'Spam',
  };
  return labels[category] || category;
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function InboxDrawer({
  message,
  open,
  onClose,
  onArchive,
  onDone,
  onReply,
  onNavigate,
}: InboxDrawerProps) {
  const [drawerWidth, setDrawerWidth] = useState(55); // percentage
  const [isResizing, setIsResizing] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyFocused, setReplyFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);

  // Load drawer width from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('bb-inbox-drawer-width');
    if (saved) {
      const width = parseFloat(saved);
      if (width >= 40 && width <= 70) {
        setDrawerWidth(width);
      }
    }
  }, []);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open || !message) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;

      // Allow text input in reply textarea
      if (tag === 'TEXTAREA' && e.key !== 'Escape' && !(e.metaKey || e.ctrlKey)) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'j':
          e.preventDefault();
          onNavigate('next');
          break;
        case 'k':
          e.preventDefault();
          onNavigate('prev');
          break;
        case 'e':
          e.preventDefault();
          onArchive(message.id);
          break;
        case 'd':
          e.preventDefault();
          onDone(message.id);
          break;
        case 'r':
          e.preventDefault();
          textareaRef.current?.focus();
          break;
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

  // Resizing logic
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!drawerRef.current) return;

      const viewportWidth = window.innerWidth;
      const newWidth = (viewportWidth - e.clientX) / viewportWidth * 100;

      if (newWidth >= 40 && newWidth <= 70) {
        setDrawerWidth(newWidth);
        localStorage.setItem('bb-inbox-drawer-width', newWidth.toString());
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleSendReply = () => {
    if (message && replyText.trim()) {
      onReply(message.id, replyText);
      setReplyText('');
    }
  };

  const handleAutoExpand = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReplyText(e.target.value);
    // Auto-expand textarea
    if (e.target) {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
    }
  };

  if (!open || !message) return null;

  const sender = message.contactName || message.senderName || message.senderEmail || 'Unknown';
  const ChannelIcon = CHANNEL_ICONS[message.channelType] || GmailIcon;
  const brandColor = CHANNEL_BRAND_COLORS[message.channelType] || 'var(--text-dim)';

  // Avatar resolution
  const email = message.senderEmail;
  const syncAvatar = email ? resolveAvatarSync(email, sender) : null;
  const [avatar, setAvatar] = React.useState<AvatarResult | null>(syncAvatar);

  React.useEffect(() => {
    if (!email) return;
    let cancelled = false;
    resolveAvatar(email, sender).then((result) => {
      if (!cancelled) setAvatar(result);
    });
    return () => {
      cancelled = true;
    };
  }, [email, sender]);

  const showSummary = message.significance >= 5;

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          transition: 'opacity 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-label={`Reading: ${message.subject || 'Message'}`}
        aria-modal="true"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: `${drawerWidth}%`,
          zIndex: 51,
          background: 'var(--glass-bg-heavy, rgba(12, 16, 24, 0.85))',
          backdropFilter: 'blur(28px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '-8px 0 40px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Resize Handle */}
        <div
          ref={resizeHandleRef}
          onMouseDown={() => setIsResizing(true)}
          style={{
            position: 'absolute',
            left: -4,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: 'col-resize',
            zIndex: 100,
            transition: 'background 150ms ease',
            background: isResizing ? 'rgba(255, 90, 31, 0.2)' : 'transparent',
          }}
        />

        {/* Header: Actions + Close */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            flexShrink: 0,
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              style={{
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
                transition: 'all 150ms ease',
              }}
              onClick={() => textareaRef.current?.focus()}
              title="Reply (R)"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
              }}
            >
              <Reply size={13} /> Reply
            </button>
            <button
              style={{
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
                transition: 'all 150ms ease',
              }}
              onClick={() => {/* TODO: forward */}}
              title="Forward (F)"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
              }}
            >
              <Forward size={13} /> Forward
            </button>
            <button
              style={{
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
                transition: 'all 150ms ease',
              }}
              onClick={() => onArchive(message.id)}
              title="Archive (E)"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
              }}
            >
              <Archive size={13} /> Archive
            </button>
            <button
              style={{
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
                transition: 'all 150ms ease',
              }}
              onClick={() => onDone(message.id)}
              title="Done (D)"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
              }}
            >
              <CheckCircle2 size={13} /> Done
            </button>
            <button
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(239, 68, 68, 0.08)',
                color: 'rgba(239, 68, 68, 0.8)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              onClick={() => {/* TODO: spam */}}
              title="Spam (!)"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
              }}
            >
              <AlertTriangle size={13} /> Spam
            </button>
          </div>

          <button
            style={{
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
              transition: 'all 150ms ease',
              flexShrink: 0,
            }}
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close drawer"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Meta: Sender, Subject, Time, Status Badges */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            flexShrink: 0,
          }}
        >
          {/* Sender row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
              {avatar ? (
                <img
                  src={avatar.url}
                  alt={sender}
                  width={36}
                  height={36}
                  style={{
                    borderRadius: '50%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: `${brandColor}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 600,
                    color: brandColor,
                  }}
                >
                  {sender[0]?.toUpperCase() || '?'}
                </div>
              )}
              {/* Channel badge */}
              <div
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'var(--bg-primary, #0a0f1a)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: brandColor,
                  fontSize: 9,
                }}
              >
                <ChannelIcon size={9} />
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.95)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {sender}
              </div>
              {message.senderEmail && (
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', marginTop: 1 }}>
                  {message.senderEmail}
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.35)', flexShrink: 0, textAlign: 'right' }}>
              {formatDate(message.receivedAt)}
            </div>
          </div>

          {/* Subject */}
          {message.subject && (
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.95)',
                margin: 0,
                lineHeight: 1.3,
                marginBottom: 10,
              }}
            >
              {message.subject}
            </h2>
          )}

          {/* Status Badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '3px 10px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                background:
                  message.category === 'actionable' ? 'rgba(255, 90, 31, 0.15)' :
                  message.category === 'personal' ? 'rgba(139, 92, 246, 0.15)' :
                  message.category === 'spam' ? 'rgba(239, 68, 68, 0.15)' :
                  'rgba(255, 255, 255, 0.06)',
                color:
                  message.category === 'actionable' ? '#FF7A45' :
                  message.category === 'personal' ? '#A78BFA' :
                  message.category === 'spam' ? '#F87171' :
                  'rgba(255, 255, 255, 0.5)',
              }}
            >
              {getCategoryLabel(message.category)}
            </span>

            {message.threadStatus && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '3px 10px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 500,
                  background: message.threadStatus === 'waiting_on_you' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.06)',
                  color: message.threadStatus === 'waiting_on_you' ? '#60A5FA' : 'rgba(255, 255, 255, 0.4)',
                }}
              >
                {message.threadStatus === 'waiting_on_you' ? 'Waiting on you' :
                 message.threadStatus === 'waiting_on_them' ? 'Waiting on them' :
                 message.threadStatus === 'new' ? 'New' : 'Resolved'}
              </span>
            )}
          </div>
        </div>

        {/* Body Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            color: 'rgba(255, 255, 255, 0.85)',
            fontSize: 14,
            lineHeight: 1.7,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* AI Summary Placeholder */}
          {showSummary && (
            <div
              style={{
                padding: '16px',
                borderRadius: 12,
                border: '1px solid rgba(139, 92, 246, 0.2)',
                background: 'rgba(139, 92, 246, 0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Sparkles size={16} style={{ color: '#A78BFA', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#A78BFA', marginBottom: 4 }}>
                  AI Summary (Task #13)
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
                  Summary generation coming soon — will appear here
                </div>
              </div>
            </div>
          )}

          {/* Body Text */}
          <div
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {message.bodyPreview}
          </div>
        </div>

        {/* Reply Composer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              ref={textareaRef}
              value={replyText}
              onChange={handleAutoExpand}
              onFocus={() => setReplyFocused(true)}
              onBlur={() => setReplyFocused(false)}
              placeholder="Type your reply... (Cmd+Enter to send)"
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: replyFocused ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(255, 255, 255, 0.06)',
                background: 'rgba(13, 17, 23, 0.6)',
                color: 'var(--text-primary, #F1F5F9)',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'all 150ms ease',
                resize: 'none',
                minHeight: 40,
                maxHeight: 200,
                boxShadow: replyFocused ? '0 0 0 2px rgba(255, 90, 31, 0.15)' : 'none',
              }}
            />
            <button
              onClick={handleSendReply}
              disabled={!replyText.trim()}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: replyText.trim() ? '#FF5A1F' : 'rgba(255, 90, 31, 0.3)',
                color: replyText.trim() ? '#000' : 'rgba(0, 0, 0, 0.3)',
                fontSize: 12,
                fontWeight: 600,
                cursor: replyText.trim() ? 'pointer' : 'default',
                transition: 'all 150ms ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (replyText.trim()) {
                  e.currentTarget.style.background = '#FF7A45';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (replyText.trim()) {
                  e.currentTarget.style.background = '#FF5A1F';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              Send
            </button>
          </div>

          {/* Keyboard hint */}
          <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.25)', marginTop: 8 }}>
            <kbd style={{
              padding: '2px 5px',
              borderRadius: 4,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: 10,
              fontFamily: 'inherit',
            }}>⌘⏎</kbd> to send
          </div>
        </div>
      </div>
    </>
  );
}
