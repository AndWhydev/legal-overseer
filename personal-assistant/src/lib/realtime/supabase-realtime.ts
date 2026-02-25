'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export type RealtimeTable =
  | 'approval_queue'
  | 'channel_messages'
  | 'agent_runs'
  | 'notifications'
  | 'leads'
  | 'invoices';

export interface RealtimeFilter {
  event?: RealtimeEvent;
  schema?: string;
  filter?: string; // e.g. "status=eq.pending"
}

export interface RealtimePayload<T = Record<string, unknown>> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: Partial<T>;
  table: string;
}

// ---------------------------------------------------------------------------
// Subscription Manager (singleton)
// ---------------------------------------------------------------------------

class RealtimeManager {
  private client: SupabaseClient | null = null;
  private channels: Map<string, RealtimeChannel> = new Map();
  private refCounts: Map<string, number> = new Map();

  getClient(): SupabaseClient | null {
    if (!this.client) {
      this.client = createClient();
    }
    return this.client;
  }

  subscribe(
    table: RealtimeTable,
    filter: RealtimeFilter,
    callback: (payload: RealtimePayload) => void,
  ): () => void {
    const client = this.getClient();
    if (!client) return () => {};

    const event = filter.event || '*';
    const schema = filter.schema || 'public';
    const channelKey = `${table}:${event}:${schema}:${filter.filter || ''}`;

    const count = this.refCounts.get(channelKey) || 0;
    this.refCounts.set(channelKey, count + 1);

    // If channel already exists, we still need individual callbacks.
    // Supabase channels are 1:1 with subscriptions, so create unique channels.
    const uniqueKey = `${channelKey}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;

    const pgFilter: Record<string, string> = {
      event,
      schema,
      table,
    };
    if (filter.filter) {
      pgFilter.filter = filter.filter;
    }

    const channel = client
      .channel(uniqueKey)
      .on('postgres_changes' as never, pgFilter, (payload: unknown) => {
        const p = payload as RealtimePayload;
        callback(p);
      })
      .subscribe();

    this.channels.set(uniqueKey, channel);

    // Return cleanup function
    return () => {
      const ch = this.channels.get(uniqueKey);
      if (ch) {
        client.removeChannel(ch);
        this.channels.delete(uniqueKey);
      }
      const c = this.refCounts.get(channelKey) || 1;
      this.refCounts.set(channelKey, c - 1);
    };
  }

  cleanup(): void {
    const client = this.getClient();
    if (!client) return;
    for (const [key, channel] of this.channels) {
      client.removeChannel(channel);
      this.channels.delete(key);
    }
    this.refCounts.clear();
  }
}

export const realtimeManager = new RealtimeManager();

// ---------------------------------------------------------------------------
// React Hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to Supabase Realtime postgres_changes for a table.
 *
 * @param table   - Table name to subscribe to
 * @param filter  - Event type, schema, and optional row-level filter
 * @param callback - Called on each change event
 *
 * Handles connection lifecycle: subscribe on mount, cleanup on unmount.
 * Reconnects automatically via Supabase client internals.
 */
export function useRealtimeSubscription<T = Record<string, unknown>>(
  table: RealtimeTable,
  filter: RealtimeFilter,
  callback: (payload: RealtimePayload<T>) => void,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const stableFilter = useRef(filter);
  // Only update if the serialized value changes
  const filterKey = `${filter.event || '*'}:${filter.schema || 'public'}:${filter.filter || ''}`;
  const prevFilterKey = useRef(filterKey);
  if (filterKey !== prevFilterKey.current) {
    stableFilter.current = filter;
    prevFilterKey.current = filterKey;
  }

  useEffect(() => {
    const unsub = realtimeManager.subscribe(
      table,
      stableFilter.current,
      (payload) => callbackRef.current(payload as RealtimePayload<T>),
    );

    return unsub;
  }, [table, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
