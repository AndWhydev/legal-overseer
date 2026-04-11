import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useNotifications, type StoredNotification } from '@/hooks/useNotifications';

// ---------------------------------------------------------------------------
// Notification type icons
// ---------------------------------------------------------------------------

function getIcon(type?: string): string {
  switch (type) {
    case 'approval':
      return '\u2705'; // checkmark
    case 'workflow':
      return '\u2699\uFE0F'; // gear
    case 'chat':
      return '\uD83D\uDCAC'; // speech bubble
    case 'alert':
      return '\u26A0\uFE0F'; // warning
    default:
      return '\uD83D\uDD14'; // bell
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// ---------------------------------------------------------------------------
// Notification row
// ---------------------------------------------------------------------------

function NotificationRow({
  item,
  onPress,
}: {
  item: StoredNotification;
  onPress: (item: StoredNotification) => void;
}) {
  const type = (item.data?.type as string) ?? undefined;

  return (
    <TouchableOpacity
      style={[styles.row, !item.read && styles.unread]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <Text style={styles.icon}>{getIcon(type)}</Text>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.rowBody} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.rowTime}>{formatTime(item.receivedAt)}</Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Activity screen
// ---------------------------------------------------------------------------

export default function ActivityScreen() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [refreshing, setRefreshing] = React.useState(false);

  const handlePress = useCallback(
    (item: StoredNotification) => {
      markRead(item.id);

      const data = item.data as { type?: string; id?: string; threadId?: string } | undefined;
      if (!data?.type) return;

      switch (data.type) {
        case 'approval':
          if (data.id) router.push(`/approval/${data.id}` as never);
          break;
        case 'workflow':
          // Already on activity tab
          break;
        case 'chat':
          if (data.threadId) router.push(`/chat/${data.threadId}` as never);
          break;
      }
    },
    [markRead],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Notifications are local -- no fetch needed. Just trigger re-render.
    setTimeout(() => setRefreshing(false), 300);
  }, []);

  return (
    <View style={styles.container}>
      {/* Header with mark all read action */}
      {unreadCount > 0 && (
        <TouchableOpacity style={styles.markAllButton} onPress={markAllRead}>
          <Text style={styles.markAllText}>Mark all as read ({unreadCount})</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationRow item={item} onPress={handlePress} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#666"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>{'\uD83D\uDD14'}</Text>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyBody}>
              You'll see alerts, approvals, and workflow updates here.
            </Text>
          </View>
        }
        contentContainerStyle={
          notifications.length === 0 ? styles.emptyList : undefined
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  markAllButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  markAllText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  unread: {
    backgroundColor: '#0a1628',
  },
  icon: {
    fontSize: 22,
    marginRight: 12,
    marginTop: 2,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  rowBody: {
    fontSize: 13,
    color: '#999',
    marginBottom: 4,
    lineHeight: 18,
  },
  rowTime: {
    fontSize: 11,
    color: '#555',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563eb',
    marginTop: 6,
    marginLeft: 8,
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});
