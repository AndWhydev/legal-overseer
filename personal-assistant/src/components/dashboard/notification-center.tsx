'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { IconBell, IconCircleCheck, IconBolt, IconAlertTriangle, IconAlertCircle } from '@tabler/icons-react';
import { motion, AnimatePresence } from 'motion/react';
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
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

// ─── localStorage persistence helpers ───────────────────────────────────────

const STORAGE_KEY = 'bb-notification-read-ids';

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    // corrupted or unavailable — start fresh
  }
  return new Set();
}

function persistReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getNotificationIcon(type: 'approval' | 'lead' | 'invoice' | 'task') {
  switch (type) {
    case 'approval':
      return IconCircleCheck;
    case 'lead':
      return IconBolt;
    case 'invoice':
      return IconAlertTriangle;
    default:
      return IconBell;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function NotificationCenter({ onTabChange }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bellHovered, setBellHovered] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const clientRef = useRef<SupabaseClient | null>(null);

  // Hydrate read IDs from localStorage on mount
  useEffect(() => {
    setReadIds(loadReadIds());
  }, []);

  // Persist read IDs to localStorage on change
  const updateReadIds = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setReadIds(prev => {
      const next = updater(prev);
      persistReadIds(next);
      return next;
    });
  }, []);

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

      const { data: approvals, error: approvalsError } = await clientRef.current
        .from('approval_queue')
        .select('id, created_at')
        .eq('status', 'pending')
        .limit(10);

      if (approvalsError && approvalsError.code !== 'PGRST116') {
        logger.warn('Error fetching approvals:', approvalsError);
      }

      const { data: leads, error: leadsError } = await clientRef.current
        .from('leads')
        .select('id, source_channel, metadata, created_at')
        .eq('status', 'new')
        .limit(10);

      if (leadsError && leadsError.code !== 'PGRST116') {
        logger.warn('Error fetching leads:', leadsError);
      }

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
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        });

      const cleanup = () => {
        client.removeChannel(channel);
      };

      const fallbackTimer = setTimeout(() => {
        if (!realtimeActive && !pollIntervalRef.current) {
          pollIntervalRef.current = setInterval(() => {
            fetchNotifications();
          }, 15000);
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

  // Handle notification click — fade out then mark read
  const handleNotificationClick = useCallback((notification: NotificationItem) => {
    setDismissingIds(prev => new Set(prev).add(notification.id));
    // Wait for fade-out animation then mark read and navigate
    setTimeout(() => {
      updateReadIds(prev => new Set(prev).add(notification.id));
      setDismissingIds(prev => {
        const next = new Set(prev);
        next.delete(notification.id);
        return next;
      });
      onTabChange?.(notification.tabId);
      setIsOpen(false);
    }, 250);
  }, [onTabChange, updateReadIds]);

  // Mark all as read
  const handleMarkAllAsRead = useCallback(() => {
    updateReadIds(() => new Set(notifications.map(n => n.id)));
  }, [notifications, updateReadIds]);

  // Count unread notifications
  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  // Flat list of unread notifications (no grouping — cleaner)
  const unreadNotifications = notifications.filter(n => !readIds.has(n.id));

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell Button — minimal style matching chat download button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setBellHovered(true)}
        onMouseLeave={() => setBellHovered(false)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        style={{
          background: 'none',
          border: 'none',
          padding: 4,
          color: 'var(--text-muted, rgba(255,255,255,0.35))',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <motion.div
          animate={bellHovered ? { rotate: [0, -8, 8, -4, 4, 0] } : { rotate: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <IconBell size={18} stroke={1.8} />
        </motion.div>

        {/* Unread dot badge */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key={unreadCount}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [1.3, 1], opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: 'var(--bb-red, #ef4444)',
                boxShadow: '0 0 0 2px var(--bg-primary, #0A0A0B)',
              }}
              role="status"
              aria-label={`${unreadCount} unread notifications`}
            />
          )}
        </AnimatePresence>
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              top: 56,
              right: 16,
              width: 340,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 480,
              zIndex: 1000,
              background: 'var(--bg-card, rgba(15, 20, 30, 0.95))',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              boxShadow: '0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04) inset',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--text-primary, rgba(255,255,255,0.92))',
                  letterSpacing: '-0.01em',
                }}
              >
                Notifications
              </span>
              <AnimatePresence>
                {unreadCount > 0 && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleMarkAllAsRead}
                    aria-label="Mark all notifications as read"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted, rgba(255,255,255,0.35))',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 400,
                      padding: '2px 6px',
                      borderRadius: 4,
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary, rgba(255,255,255,0.6))';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted, rgba(255,255,255,0.35))';
                    }}
                  >
                    Mark all read
                  </motion.button>
                )}
              </AnimatePresence>
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
                    padding: '28px 14px',
                    textAlign: 'center',
                    color: 'var(--text-muted, rgba(255,255,255,0.35))',
                    fontSize: 14,
                  }}
                >
                  Loading...
                </div>
              )}

              {error && (
                <Empty className="py-4 px-2">
                  <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
                  <EmptyTitle>Something went wrong</EmptyTitle>
                  <EmptyDescription>{error}</EmptyDescription>
                </Empty>
              )}

              {/* Empty state: no notifications at all */}
              {!isLoading && !error && notifications.length === 0 && (
                <Empty className="py-6">
                  <EmptyMedia variant="icon"><IconBell size={20} /></EmptyMedia>
                  <EmptyTitle>No notifications yet</EmptyTitle>
                </Empty>
              )}

              {/* Empty state: all read */}
              {!isLoading && !error && unreadCount === 0 && notifications.length > 0 && (
                <Empty className="py-6">
                  <EmptyMedia variant="icon"><IconCircleCheck size={20} /></EmptyMedia>
                  <EmptyTitle>All caught up</EmptyTitle>
                </Empty>
              )}

              {/* Notification items — flat list, staggered fade-in */}
              <AnimatePresence mode="popLayout">
                {unreadNotifications.map((notification, index) => (
                  <NotificationItemRow
                    key={notification.id}
                    notification={notification}
                    index={index}
                    isDismissing={dismissingIds.has(notification.id)}
                    onClick={() => handleNotificationClick(notification)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Notification Item Row Component ─────────────────────────────────────────

interface NotificationItemRowProps {
  notification: NotificationItem;
  index: number;
  isDismissing: boolean;
  onClick: () => void;
}

function NotificationItemRow({
  notification,
  index,
  isDismissing,
  onClick,
}: NotificationItemRowProps) {
  const Icon = getNotificationIcon(notification.type);
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{
        opacity: isDismissing ? 0 : 1,
        y: 0,
      }}
      exit={{ opacity: 0, x: -8 }}
      transition={{
        duration: 0.2,
        delay: isDismissing ? 0 : index * 0.04,
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        padding: '8px 14px',
        border: 'none',
        background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text-primary, rgba(255,255,255,0.92))',
            lineHeight: 1.3,
          }}
        >
          {notification.title}
        </div>
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-secondary, rgba(255,255,255,0.55))',
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {notification.description}
        </div>
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-muted, rgba(255,255,255,0.3))',
            marginTop: 2,
          }}
        >
          {formatTimeAgo(notification.timestamp)}
        </div>
      </div>
      <div
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: 'var(--bb-accent, rgba(99,140,255,0.6))',
          flexShrink: 0,
          marginTop: 6,
        }}
      />
    </motion.button>
  );
}

export default NotificationCenter;
