'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/core/logger';

export interface BadgeCounts {
  approvals: number;
  leads: number;
  invoices: number;
}

/**
 * Shared hook for badge count fetching with realtime subscriptions + polling fallback.
 * Used by both sidebar-nav and bottom-nav to avoid duplicate Supabase connections.
 */
export function useBadgeCounts(channelName = 'badge-counts'): BadgeCounts {
  const [badgeCounts, setBadgeCounts] = useState<BadgeCounts>({
    approvals: 0,
    leads: 0,
    invoices: 0,
  });
  const clientRef = useRef<SupabaseClient | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const client = createClient();
    if (!client) return;
    clientRef.current = client;
  }, []);

  const fetchBadgeCounts = useCallback(async () => {
    if (!clientRef.current) return;

    try {
      const [approvalsRes, leadsRes, invoicesRes] = await Promise.all([
        clientRef.current
          .from('approval_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        clientRef.current
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'new'),
        clientRef.current
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'overdue'),
      ]);

      setBadgeCounts({
        approvals: approvalsRes.count || 0,
        leads: leadsRes.count || 0,
        invoices: invoicesRes.count || 0,
      });
    } catch (err) {
      logger.warn('Error fetching badge counts:', err);
    }
  }, []);

  useEffect(() => {
    if (!clientRef.current) return;
    const client = clientRef.current;

    fetchBadgeCounts();

    try {
      const channel = client
        .channel(channelName)
        .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'approval_queue' }, () => fetchBadgeCounts())
        .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'leads' }, () => fetchBadgeCounts())
        .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'invoices' }, () => fetchBadgeCounts())
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED' && pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        });

      pollIntervalRef.current = setInterval(() => fetchBadgeCounts(), 30000);

      return () => {
        client.removeChannel(channel);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    } catch {
      pollIntervalRef.current = setInterval(() => fetchBadgeCounts(), 30000);
      return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    }
  }, [fetchBadgeCounts, channelName]);

  return badgeCounts;
}
