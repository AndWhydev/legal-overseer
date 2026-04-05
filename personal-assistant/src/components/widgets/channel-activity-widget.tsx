'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconUsers } from '@tabler/icons-react';
import { WidgetCard } from './widget-card';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

export function ChannelActivityWidget() {
  const [activity, setActivity] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('channel_messages').select('*')
      .order('received_at', { ascending: false }).limit(5)
      .then(({ data }) => { if (data) setActivity(data); });
  }, []);

  return (
    <WidgetCard
      title="Recent Channel Activity"
      subtitle="Latest messages across all channels"
      icon={<IconUsers size={20} className="text-cyan-400" />}
    >
      <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
        {activity.length === 0 ? (
          <Empty><EmptyTitle>No recent activity</EmptyTitle><EmptyDescription>Channel messages will appear here.</EmptyDescription></Empty>
        ) : (
          activity.map((item, idx) => (
            <div key={(item.id as string) || idx} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
              <div className="w-2 h-2 rounded-full bg-accent mt-2 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {(item.sender_name || item.content || item.message || 'Activity Update') as string}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {item.subject ? `${item.subject}` : (item.body as string || '').slice(0, 80)}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {item.received_at || item.created_at ? (
                    new Date((item.received_at || item.created_at) as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  ) : 'Just now'}
                  {item.channel_type ? <span className="ml-2 text-sm opacity-60">via {String(item.channel_type)}</span> : null}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
