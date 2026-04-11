import { useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useMutationState } from '@tanstack/react-query';
import { apiClient } from './api';

/**
 * Default mutation options for offline-first operations.
 * Mutations will queue when offline and replay on reconnect.
 */
export const offlineMutationDefaults = {
  retry: 3,
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30000),
  networkMode: 'offlineFirst' as const,
};

/**
 * Register default mutation functions for known mutation keys.
 * This allows TanStack Query to resume persisted mutations after app restart --
 * without this, the queryClient won't know what function to call for a restored mutation.
 */
export function configurePersistentMutations(queryClient: QueryClient): void {
  // Chat message mutation: queues when offline, sends on reconnect
  queryClient.setMutationDefaults(['sendMessage'], {
    mutationFn: async (variables: { message: string; threadId: string | null }) => {
      const res = await apiClient.post('/api/agent/chat', {
        message: variables.message,
        threadId: variables.threadId || undefined,
      });
      return res.data;
    },
    ...offlineMutationDefaults,
  });

  // Approval resolve mutation: approve or reject
  queryClient.setMutationDefaults(['resolveApproval'], {
    mutationFn: async (variables: { id: string; decision: 'approved' | 'rejected' }) => {
      const res = await apiClient.post('/api/agent/approvals', {
        id: variables.id,
        decision: variables.decision,
      });
      return res.data;
    },
    ...offlineMutationDefaults,
  });
}

/**
 * Hook that returns the count of pending (paused/in-flight) offline mutations.
 * Used by OfflineBanner to show "Syncing N pending messages..."
 */
export function usePendingMutations(): number {
  const pendingMutations = useMutationState({
    filters: { status: 'pending' },
    select: (mutation) => mutation.state.status,
  });

  return useMemo(() => pendingMutations.length, [pendingMutations]);
}
