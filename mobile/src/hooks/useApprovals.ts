import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export interface ApprovalRecord {
  id: string;
  title: string;
  body: string;
  priority: 'urgent' | 'normal' | 'low';
  action_type: string;
  action_payload?: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface ApprovalsResponse {
  approvals: ApprovalRecord[];
}

/**
 * Hook for fetching pending approval records from the backend.
 */
export function useApprovals() {
  const query = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: async () => {
      const res = await apiClient.get<ApprovalsResponse>(
        '/api/agent/approvals?status=pending',
      );
      return res.data.approvals ?? [];
    },
    staleTime: 1000 * 30, // 30s
  });

  return {
    approvals: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
    error: query.error,
  };
}

/**
 * Hook for resolving (approving/rejecting) an approval.
 *
 * Uses mutationKey ['resolveApproval'] registered in configurePersistentMutations
 * so the mutation persists offline and replays on reconnect.
 *
 * Optimistic: removes the item from the list immediately, rolls back on error.
 */
export function useResolveApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['resolveApproval'],
    onMutate: async (variables: { id: string; decision: 'approved' | 'rejected' }) => {
      // Cancel outgoing fetches for approvals
      await queryClient.cancelQueries({ queryKey: ['approvals', 'pending'] });

      // Snapshot current data for rollback
      const previousApprovals = queryClient.getQueryData<ApprovalRecord[]>([
        'approvals',
        'pending',
      ]);

      // Optimistically remove the resolved approval from the list
      queryClient.setQueryData<ApprovalRecord[]>(
        ['approvals', 'pending'],
        (old) => (old ?? []).filter((a) => a.id !== variables.id),
      );

      return { previousApprovals };
    },
    onError: (_err, _variables, context) => {
      // Roll back optimistic update on error
      if (context?.previousApprovals) {
        queryClient.setQueryData(
          ['approvals', 'pending'],
          context.previousApprovals,
        );
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency after mutation completes
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}
