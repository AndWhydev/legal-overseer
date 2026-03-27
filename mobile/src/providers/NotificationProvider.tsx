import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setupNotificationHandler,
  registerPushToken,
  handleNotificationResponse,
} from '@/lib/push';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredNotification {
  id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  receivedAt: string;
  read: boolean;
}

interface NotificationContextValue {
  notifications: StoredNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const STORAGE_KEY = 'BITBIT_NOTIFICATIONS';
const MAX_STORED = 100;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markRead: () => {},
  markAllRead: () => {},
  clearAll: () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const appState = useRef(AppState.currentState);

  // Load persisted notifications on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as StoredNotification[];
          setNotifications(parsed);
        } catch {
          // Corrupted storage -- ignore
        }
      }
    });
  }, []);

  // Persist notifications when they change
  useEffect(() => {
    if (notifications.length > 0) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notifications)).catch(() => {});
    }
  }, [notifications]);

  // Set up notification handler + register token on mount
  useEffect(() => {
    setupNotificationHandler();
    registerPushToken();
  }, []);

  // Listen for foreground notifications
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const newNotif: StoredNotification = {
        id: notification.request.identifier,
        title: content.title ?? '',
        body: content.body ?? '',
        data: content.data as Record<string, unknown> | undefined,
        receivedAt: new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => [newNotif, ...prev].slice(0, MAX_STORED));

      // Update badge count
      Notifications.getBadgeCountAsync().then((count) => {
        Notifications.setBadgeCountAsync(count + 1).catch(() => {});
      });
    });

    return () => subscription.remove();
  }, []);

  // Listen for notification taps
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      // Mark as read
      const id = response.notification.request.identifier;
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );

      // Navigate to relevant screen
      handleNotificationResponse(response);
    });

    return () => subscription.remove();
  }, []);

  // Re-register token on app foreground (handles token refresh)
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          registerPushToken();
        }
        appState.current = nextAppState;
      },
    );

    return () => subscription.remove();
  }, []);

  // Computed unread count
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    // Decrement badge
    Notifications.getBadgeCountAsync().then((count) => {
      if (count > 0) {
        Notifications.setBadgeCountAsync(count - 1).catch(() => {});
      }
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    Notifications.setBadgeCountAsync(0).catch(() => {});
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    Notifications.setBadgeCountAsync(0).catch(() => {});
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markRead,
        markAllRead,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotificationContext() {
  return useContext(NotificationContext);
}
