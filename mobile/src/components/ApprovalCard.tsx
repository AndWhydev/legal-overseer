import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import type { ApprovalRecord } from '@/hooks/useApprovals';

interface Props {
  approval: ApprovalRecord;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPress: (id: string) => void;
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: '#dc2626', text: '#fff' },
  normal: { bg: '#2563eb', text: '#fff' },
  low: { bg: '#6b7280', text: '#fff' },
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Swipeable approval card.
 *
 * - Swipe right (left-to-right): green "Approve" action
 * - Swipe left (right-to-left): red "Reject" action
 * - On swipe complete: haptic feedback + callback
 * - Tap: navigate to detail screen
 */
export function ApprovalCard({ approval, onApprove, onReject, onPress }: Props) {
  const swipeableRef = useRef<Swipeable>(null);
  const priority = PRIORITY_COLORS[approval.priority] ?? PRIORITY_COLORS.normal;

  const renderLeftActions = () => (
    <View style={styles.approveAction}>
      <Text style={styles.actionText}>Approve</Text>
    </View>
  );

  const renderRightActions = () => (
    <View style={styles.rejectAction}>
      <Text style={styles.actionText}>Reject</Text>
    </View>
  );

  const handleSwipeOpen = (direction: 'left' | 'right') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    swipeableRef.current?.close();

    if (direction === 'left') {
      // Swiped right (left-to-right) -- approve
      onApprove(approval.id);
    } else {
      // Swiped left (right-to-left) -- reject
      onReject(approval.id);
    }
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeOpen}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
    >
      <Pressable
        style={styles.card}
        onPress={() => onPress(approval.id)}
      >
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {approval.title}
          </Text>
          <View style={[styles.priorityBadge, { backgroundColor: priority.bg }]}>
            <Text style={[styles.priorityText, { color: priority.text }]}>
              {approval.priority}
            </Text>
          </View>
        </View>

        <Text style={styles.body} numberOfLines={2}>
          {approval.body}
        </Text>

        <View style={styles.footer}>
          <Text style={styles.actionType}>{approval.action_type}</Text>
          <Text style={styles.timestamp}>
            {formatTimestamp(approval.created_at)}
          </Text>
        </View>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#222',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  body: {
    fontSize: 14,
    color: '#999',
    lineHeight: 20,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionType: {
    fontSize: 12,
    color: '#666',
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
  },
  approveAction: {
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    marginVertical: 4,
    borderRadius: 12,
    marginLeft: 16,
  },
  rejectAction: {
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    marginVertical: 4,
    borderRadius: 12,
    marginRight: 16,
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
