import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useApprovals, useResolveApproval } from '@/hooks/useApprovals';
import { ApprovalCard } from '@/components/ApprovalCard';
import type { ApprovalRecord } from '@/hooks/useApprovals';

export default function ApprovalsScreen() {
  const { approvals, isLoading, refetch } = useApprovals();
  const resolveApproval = useResolveApproval();
  const router = useRouter();

  const handleApprove = useCallback(
    (id: string) => {
      resolveApproval.mutate({ id, decision: 'approved' });
    },
    [resolveApproval],
  );

  const handleReject = useCallback(
    (id: string) => {
      resolveApproval.mutate({ id, decision: 'rejected' });
    },
    [resolveApproval],
  );

  const handlePress = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/approval/${id}`);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ApprovalRecord }) => (
      <ApprovalCard
        approval={item}
        onApprove={handleApprove}
        onReject={handleReject}
        onPress={handlePress}
      />
    ),
    [handleApprove, handleReject, handlePress],
  );

  const keyExtractor = useCallback((item: ApprovalRecord) => item.id, []);

  const count = approvals.length;

  return (
    <View style={styles.container}>
      <FlatList
        data={approvals}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor="#2563eb"
          />
        }
        ListHeaderComponent={
          count > 0 ? (
            <View style={styles.headerSection}>
              <Text style={styles.headerCount}>
                {count} pending approval{count !== 1 ? 's' : ''}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>{'\u2705'}</Text>
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptySubtitle}>
                No pending approvals.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  list: {
    paddingVertical: 8,
    flexGrow: 1,
  },
  headerSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 4,
  },
  headerCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
  },
});
