'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, CheckCircle2, Zap, AlertTriangle, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/core/logger';
import { buildDashboardNotifications } from '@/lib/notifications/build-dashboard-notifications';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  type: 'approval' | 'lead' | 'invoice' | 'task';
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
  tabId: string;
}

interface NotificationCenterProps {
  onTabChange?: (tabId: string) => void;
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

function getNotificationIcon(type: 'approval' | 'lead' | 'invoice' | 'task') {
  switch (type) {
    case 'approval':
      return CheckCircle2;
    case 'lead':
      return Zap;
    case 'invoice':
      return AlertTriangle;
    default:
      return Bell;
  }
}

function getIconColor(type: 'approval' | 'lead' | 'invoice' | 'task'): string {
  switch (type) {
    case 'approval':
      return 'var(--bb-orange)';
    case 'lead':
      return '#60a5fa';
    case 'invoice':
      return '#ef4444';
    default:
      return 'var(--text-secondary)';
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function NotificationCenter({ onTabChange }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const clientRef = useRef<SupabaseClient | null>(null);

  // Initialize Supabase client
  useEffect(() => {
    const client = createClient();
    if (!client) {
      setError('Supabase client not initialized');
      setIsLoading(false);
      return;
    }
    clientRef.current = client;
  }, []);

  // Fetch notifications from Supabase
  const fetchNotifications = useCallback(async () => {
    if (!clientRef.current) {
      setError('Supabase client not available');
      return;
    }

    try {
      setError(null);

      // Fetch pending approvals
      const { data: approvals, error: approvalsError } = await clientRef.current
        .from('approval_queue')
        .select('id, created_at')
        .eq('status', 'pending')
        .limit(10);

      if (approvalsError && approvalsError.code !== 'PGRST116') {
        logger.warn('Error fetching approvals:', approvalsError);
      }

      // Fetch new leads
      const { data: leads, error: leadsError } = await clientRef.current
        .from('leads')
        .select('id, source_channel, metadata, created_at')
        .eq('status', 'new')
        .limit(10);

      if (leadsError && leadsError.code !== 'PGRST116') {
        logger.warn('Error fetching leads:', leadsError);
      }

      // Fetch overdue invoices
      const { data: invoices, error: invoicesError } = await clientRef.current
        .from('invoices')
        .select('id, invoice_number, created_at')
        .eq('status', 'overdue')
        .limit(10);

      if (invoicesError && invoicesError.code !== 'PGRST116') {
        logger.warn('Error fetching invoices:', invoicesError);
      }

      setNotifications(buildDashboardNotifications({
        approvals: (approvals ?? []) as Array<{ id: string; created_at: string }>,
        leads: (leads ?? []) as Array<{ id: string; source_channel: string; metadata: Record<string, unknown>; created_at: string }>,
        invoices: (invoices ?? []) as Array<{ id: string; invoice_number: string; created_at: string }>,
      }));
      setIsLoading(false);
    } catch (err) {
      logger.error('Error fetching notifications:', err);
      setError('Failed to load notifications');
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (clientRef.current) {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  // Set up Supabase realtime subscriptions with polling fallback
  useEffect(() => {
    if (!clientRef.current) return;

    const client = clientRef.current;
    let realtimeActive = false;

    // Try to subscribe to realtime changes
    try {
      const channel = client
        .channel('notification-changes')
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: 'approval_queue' },
          () => { fetchNotifications(); }
        )
        .on(
          'postgres_changes' as any,
          { event: 'INSERT', schema: 'public', table: 'leads' },
          () => { fetchNotifications(); }
        )
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: 'invoices' },
          () => { fetchNotifications(); }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            realtimeActive = true;
            // Clear polling if realtime is active
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        });

      // Cleanup realtime on unmount
      const cleanup = () => {
        client.removeChannel(channel);
      };

      // Fallback to polling if realtime not active after 5s
      const fallbackTimer = setTimeout(() => {
        if (!realtimeActive && !pollIntervalRef.current) {
          pollIntervalRef.current = setInterval(() => {
            fetchNotifications();
          }, 15000); // 15s polling as fallback
        }
      }, 5000);

      return () => {
        cleanup();
        clearTimeout(fallbackTimer);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    } catch {
      // Realtime not available, fall back to polling
      pollIntervalRef.current = setInterval(() => {
        fetchNotifications();
      }, 15000);

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
  }, [fetchNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Handle notification click
  const handleNotificationClick = (notification: NotificationItem) => {
    setReadIds(prev => new Set(prev).add(notification.id));
    onTabChange?.(notification.tabId);
    setIsOpen(false);
  };

  // Mark all as read
  const handleMarkAllAsRead = () => {
    const allIds = new Set(notifications.map(n => n.id));
    setReadIds(allIds);
  };

  // Count unread notifications
  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  // Group notifications by type
  const groupedNotifications = {
    approval: notifications.filter(n => n.type === 'approval' && !readIds.has(n.id)),
    lead: notifications.filter(n => n.type === 'lead' && !readIds.has(n.id)),
    invoice: notifications.filter(n => n.type === 'invoice' && !readIds.has(n.id)),
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'transparent',
          border: 'none',
          color: 'var(--text-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={e => { (e.currentTarget).style.background = 'var(--glass-hover-bg)'; }}
        onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; }}
      >
        <Bell size={18} strokeWidth={1.8} />
        {unreadCount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: 'var(--bb-red)',
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="bb-notification-panel"
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'fixed',
            top: '56px',
            right: '16px',
            width: '360px',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: '600px',
            zIndex: 1000,
            background: 'var(--bg-card)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'slideIn 0.2s ease-out',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                aria-label="Mark all notifications as read"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--bb-orange)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '4px 8px',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={e => {
                  (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(255, 107, 53, 0.1)';
                }}
                onMouseLeave={e => {
                  (e.target as HTMLButtonElement).style.backgroundColor = 'transparent';
                }}
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
            }}
          >
            {isLoading && (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                }}
              >
                Loading...
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: '16px',
                  margin: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: 'var(--bb-red)',
                  fontSize: '12px',
                }}
              >
                {error}
              </div>
            )}

            {!isLoading && !error && unreadCount === 0 && notifications.length === 0 && (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                }}
              >
                No notifications yet
              </div>
            )}

            {!isLoading && !error && unreadCount === 0 && notifications.length > 0 && (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                }}
              >
                All caught up!
              </div>
            )}

            {/* Approvals */}
            {groupedNotifications.approval.length > 0 && (
              <div>
                <div
                  style={{
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  Approvals
                </div>
                {groupedNotifications.approval.map(notification => (
                  <NotificationItemRow
                    key={notification.id}
                    notification={notification}
                    isRead={readIds.has(notification.id)}
                    onClick={() => handleNotificationClick(notification)}
                  />
                ))}
              </div>
            )}

            {/* Leads */}
            {groupedNotifications.lead.length > 0 && (
              <div>
                <div
                  style={{
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  Leads
                </div>
                {groupedNotifications.lead.map(notification => (
                  <NotificationItemRow
                    key={notification.id}
                    notification={notification}
                    isRead={readIds.has(notification.id)}
                    onClick={() => handleNotificationClick(notification)}
                  />
                ))}
              </div>
            )}

            {/* Invoices */}
            {groupedNotifications.invoice.length > 0 && (
              <div>
                <div
                  style={{
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  Invoices
                </div>
                {groupedNotifications.invoice.map(notification => (
                  <NotificationItemRow
                    key={notification.id}
                    notification={notification}
                    isRead={readIds.has(notification.id)}
                    onClick={() => handleNotificationClick(notification)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Notification Item Row Component ─────────────────────────────────────────

interface NotificationItemRowProps {
  notification: NotificationItem;
  isRead: boolean;
  onClick: () => void;
}

function NotificationItemRow({
  notification,
  isRead,
  onClick,
}: NotificationItemRowProps) {
  const Icon = getNotificationIcon(notification.type);
  const iconColor = getIconColor(notification.type);

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '12px 16px',
        border: 'none',
        background: 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        borderBottom: '1px solid var(--border-subtle)',
        transition: 'background-color 0.2s',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
      onMouseEnter={e => {
        (e.currentTarget).style.backgroundColor = 'var(--glass-hover-bg)';
      }}
      onMouseLeave={e => {
        (e.currentTarget).style.backgroundColor = 'transparent';
      }}
    >
      <Icon
        size={16}
        strokeWidth={2}
        style={{
          color: iconColor,
          flexShrink: 0,
          marginTop: '2px',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginBottom: '2px',
          }}
        >
          {notification.title}
        </div>
        <div
          style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginBottom: '4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {notification.description}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}
        >
          {formatTimeAgo(notification.timestamp)}
        </div>
      </div>
      {!isRead && (
        <div
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'var(--bb-orange)',
            flexShrink: 0,
            marginTop: '6px',
          }}
        />
      )}
    </button>
  );
}

export default NotificationCenter;
