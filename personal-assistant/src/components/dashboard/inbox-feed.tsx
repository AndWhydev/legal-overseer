'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useState as useLocalState } from 'react';
import { Inbox, Maximize2, CheckCircle2 } from 'lucide-react';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { useSeedData } from '@/hooks/use-seed-data';

interface InboxMessage {
  id: string;
  sender: string;
  subject: string | null;
  channel: string;
  received_at: string;
  significance: number;
  processed: boolean;
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

function priorityDot(significance: number) {
  if (significance >= 8) return 'var(--bb-red)';
  if (significance >= 5) return 'var(--bb-amber)';
  return 'var(--bb-blue)';
}

// Minimal abstract "orbit" icon — represents autonomous agentic processing
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

export function InboxFeed() {
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
      // silently fail — feed is non-critical
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

  // Use seed data when active
  const displayMessages = seed.active ? (seed.data?.inboxMessages ?? messages) : messages;
  const unreadCount = displayMessages.filter((m: InboxMessage) => !m.processed).length;

  const navigateToInbox = () => {
    window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'inbox' } }));
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRadius: 16,
        background: 'var(--bg-card, rgba(15, 20, 30, 0.35))',
        backdropFilter: 'blur(20px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
        border: '1px solid rgba(255, 255, 255, 0.03)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        }}
      >
        <Inbox size={16} style={{ color: 'var(--text-secondary)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Inbox</span>
        {unreadCount > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#fff',
              background: 'var(--bb-orange)',
              borderRadius: 99,
              padding: '1px 6px',
              lineHeight: '16px',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            onClick={() => {
              setAutopilotActive(prev => !prev);
              if (!autopilotActive) {
                fetch('/api/agent/triage', { method: 'POST' }).catch(() => {});
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 99,
              border: autopilotActive
                ? '1px solid rgba(139, 92, 246, 0.4)'
                : '1px solid rgba(255, 255, 255, 0.08)',
              background: autopilotActive
                ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(99, 102, 241, 0.1))'
                : 'rgba(255, 255, 255, 0.04)',
              color: autopilotActive ? '#c4b5fd' : 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              letterSpacing: '0.02em',
            }}
            aria-label={autopilotActive ? 'Disable autopilot' : 'Enable autopilot'}
          >
            <AutopilotIcon size={14} active={autopilotActive} />
            Autopilot
          </button>
          <button
            onClick={navigateToInbox}
            className="bb-btn bb-btn--icon"
            style={{ padding: 4 }}
            aria-label="Expand inbox"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {displayMessages.length === 0 && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            Inbox zero — all clear
          </div>
        )}
        {displayMessages.map((msg: InboxMessage) => (
          <button
            key={msg.id}
            onClick={navigateToInbox}
            className={newIds.has(msg.id) ? 'animate-inbox-slide-in' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s',
              opacity: msg.processed ? 0.6 : 1,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bb-surface-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <ChannelIcon channel={msg.channel} size={16} className="shrink-0" />

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 120,
                  }}
                >
                  {msg.sender}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>
                  {timeAgo(msg.received_at)}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {msg.subject || '(no subject)'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {msg.processed && <CheckCircle2 size={12} style={{ color: 'var(--bb-green)', opacity: 0.7 }} />}
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: priorityDot(msg.significance),
                  flexShrink: 0,
                }}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
