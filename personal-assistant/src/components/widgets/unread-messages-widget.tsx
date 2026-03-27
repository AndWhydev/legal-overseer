'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { IconInbox } from '@tabler/icons-react';
import { WidgetCard } from './widget-card';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

export function UnreadMessagesWidget() {
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);

  const load = useCallback(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('channel_messages').select('*')
      .eq('processed', false)
      .order('received_at', { ascending: false })
      .limit(5)
      .then(({ data }) => { if (data) setMessages(data); });
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeSubscription('channel_messages', { event: 'INSERT' }, load);

  return (
    <WidgetCard
      title="Unread Messages"
      subtitle={`${messages.length} unread`}
      icon={<IconInbox size={20} className="text-violet-400" />}
    >
      <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
        {messages.length === 0 ? (
          <Empty><EmptyTitle>All caught up</EmptyTitle><EmptyDescription>No unread messages.</EmptyDescription></Empty>
        ) : (
          messages.map((msg, idx) => (
            <div key={(msg.id as string) || idx} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
              <div className="w-2 h-2 rounded-full bg-violet-400 mt-2 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {(msg.sender_name || msg.content || 'New message') as string}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {(msg.body as string || (msg.content as string) || '').slice(0, 80)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {msg.received_at ? new Date(msg.received_at as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                  {msg.channel_type ? <span className="ml-2 opacity-60">via {String(msg.channel_type)}</span> : null}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
