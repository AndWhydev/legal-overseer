'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SFPerson2 } from 'sf-symbols-lib';
import { WidgetCard } from './widget-card';
import { EmptyState } from '@/components/ui/empty-state';

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
      icon={<SFPerson2 size={20} style={{ color: 'var(--bb-cyan)' }} />}
    >
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {activity.length === 0 ? (
          <EmptyState icon={<SFPerson2 size={32} />} title="No recent activity" description="Channel messages will appear here." />
        ) : (
          activity.map((item, idx) => (
            <div key={(item.id as string) || idx} className="flex items-start gap-3 pb-3 border-b border-[var(--border-subtle)] last:border-0">
              <div className="w-2 h-2 rounded-full bg-[var(--accent)] mt-2 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {(item.sender_name || item.content || item.message || 'Activity Update') as string}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {item.subject ? `${item.subject}` : (item.body as string || '').slice(0, 80)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.received_at || item.created_at ? (
                    new Date((item.received_at || item.created_at) as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  ) : 'Just now'}
                  {item.channel_type ? <span className="ml-2 text-[10px] opacity-60">via {String(item.channel_type)}</span> : null}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
