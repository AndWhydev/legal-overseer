import { useNotificationContext } from '@/providers/NotificationProvider';
import type { StoredNotification } from '@/providers/NotificationProvider';

export type { StoredNotification };

/**
 * Hook for accessing notification state and actions.
 *
 * @returns { notifications, unreadCount, markRead, markAllRead, clearAll }
 */
export function useNotifications() {
  const ctx = useNotificationContext();
  return {
    notifications: ctx.notifications,
    unreadCount: ctx.unreadCount,
    markRead: ctx.markRead,
    markAllRead: ctx.markAllRead,
    clearAll: ctx.clearAll,
  };
}
