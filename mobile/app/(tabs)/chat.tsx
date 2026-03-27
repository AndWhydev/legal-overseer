import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThreadList } from '@/hooks/useChat';

interface ThreadItem {
  id: string;
  title: string | null;
  lastActivity: string;
  messageCount: number;
  preview: string | null;
}

export default function ChatScreen() {
  const router = useRouter();
  const { data: threads, isLoading, refetch, isRefetching } = useThreadList();

  const handleNewChat = useCallback(() => {
    router.push('/chat/new');
  }, [router]);

  const handleThreadPress = useCallback(
    (threadId: string) => {
      router.push(`/chat/${threadId}`);
    },
    [router],
  );

  const renderThread = useCallback(
    ({ item }: { item: ThreadItem }) => (
      <TouchableOpacity
        style={styles.threadRow}
        onPress={() => handleThreadPress(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.threadContent}>
          <Text style={styles.threadTitle} numberOfLines={1}>
            {item.title || 'New conversation'}
          </Text>
          {item.preview && (
            <Text style={styles.threadPreview} numberOfLines={2}>
              {item.preview}
            </Text>
          )}
        </View>
        <View style={styles.threadMeta}>
          <Text style={styles.threadTime}>{formatRelative(item.lastActivity)}</Text>
          {item.messageCount > 0 && (
            <Text style={styles.threadCount}>{item.messageCount}</Text>
          )}
        </View>
      </TouchableOpacity>
    ),
    [handleThreadPress],
  );

  const ListEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color="#2563eb" />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No conversations yet</Text>
        <Text style={styles.emptySubtitle}>
          Tap the + button to start a new chat
        </Text>
      </View>
    );
  }, [isLoading]);

  return (
    <View style={styles.container}>
      {/* Header with New Chat button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversations</Text>
        <TouchableOpacity
          onPress={handleNewChat}
          style={styles.newChatButton}
          accessibilityLabel="New chat"
        >
          <Text style={styles.newChatIcon}>+</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={threads ?? []}
        renderItem={renderThread}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={
          !threads?.length ? styles.emptyList : undefined
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#2563eb"
            colors={['#2563eb']}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fafafa',
  },
  newChatButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatIcon: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    marginTop: -1,
  },
  threadRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  threadContent: {
    flex: 1,
    marginRight: 12,
  },
  threadTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fafafa',
    marginBottom: 2,
  },
  threadPreview: {
    fontSize: 14,
    color: '#71717a',
    lineHeight: 20,
  },
  threadMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  threadTime: {
    fontSize: 12,
    color: '#52525b',
  },
  threadCount: {
    fontSize: 11,
    color: '#71717a',
    backgroundColor: '#27272a',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    backgroundColor: '#18181b',
    marginLeft: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#a1a1aa',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#52525b',
  },
  emptyList: {
    flex: 1,
  },
});
