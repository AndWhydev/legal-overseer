import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useApprovals, useResolveApproval } from '@/hooks/useApprovals';
import { QuickAction } from '@/components/QuickAction';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#dc2626',
  normal: '#2563eb',
  low: '#6b7280',
};

function formatFullTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Full approval detail screen.
 *
 * Shows title, full body, action type, payload summary, priority, and timestamp.
 * Quick action buttons (Approve/Reject) at the bottom with haptic feedback.
 * Navigates back after action with success haptic.
 */
export default function ApprovalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { approvals, isLoading } = useApprovals();
  const resolveApproval = useResolveApproval();
  const router = useRouter();

  const approval = approvals.find((a) => a.id === id);

  const handleResolve = (decision: 'approved' | 'rejected') => {
    if (!id) return;
    Haptics.notificationAsync(
      decision === 'approved'
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
    resolveApproval.mutate(
      { id, decision },
      {
        onSuccess: () => {
          router.back();
        },
      },
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Approval' }} />
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!approval) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Approval' }} />
        <Text style={styles.notFound}>Approval not found or already resolved.</Text>
      </View>
    );
  }

  const priorityColor = PRIORITY_COLORS[approval.priority] ?? PRIORITY_COLORS.normal;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Approval Detail',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{approval.title}</Text>
          <View style={styles.metaRow}>
            <View
              style={[styles.priorityBadge, { backgroundColor: priorityColor }]}
            >
              <Text style={styles.priorityText}>
                {approval.priority.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.timestamp}>
              {formatFullTimestamp(approval.created_at)}
            </Text>
          </View>
        </View>

        {/* Body */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Details</Text>
          <Text style={styles.bodyText}>{approval.body}</Text>
        </View>

        {/* Action type */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Action Type</Text>
          <Text style={styles.actionType}>{approval.action_type}</Text>
        </View>

        {/* Payload summary */}
        {approval.action_payload &&
          Object.keys(approval.action_payload).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Action Payload</Text>
              <View style={styles.payloadContainer}>
                {Object.entries(approval.action_payload).map(([key, value]) => (
                  <View key={key} style={styles.payloadRow}>
                    <Text style={styles.payloadKey}>{key}</Text>
                    <Text style={styles.payloadValue} numberOfLines={2}>
                      {typeof value === 'string'
                        ? value
                        : JSON.stringify(value)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
      </ScrollView>

      {/* Quick action buttons */}
      <View style={styles.actionBar}>
        <QuickAction
          label="Reject"
          icon={'\u274C'}
          variant="reject"
          onPress={() => handleResolve('rejected')}
          disabled={resolveApproval.isPending}
          style={styles.actionButton}
        />
        <QuickAction
          label="Approve"
          icon={'\u2705'}
          variant="approve"
          onPress={() => handleResolve('approved')}
          disabled={resolveApproval.isPending}
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    fontSize: 16,
    color: '#666',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: 13,
    color: '#666',
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 22,
  },
  actionType: {
    fontSize: 15,
    color: '#ccc',
  },
  payloadContainer: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  payloadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  payloadKey: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },
  payloadValue: {
    fontSize: 13,
    color: '#ccc',
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  actionBar: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
    backgroundColor: '#000',
  },
  actionButton: {
    flex: 1,
  },
});
