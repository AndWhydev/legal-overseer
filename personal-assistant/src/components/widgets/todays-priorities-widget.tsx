'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SFBolt } from 'sf-symbols-lib';
import { WidgetCard } from './widget-card';
import { EmptyState } from '@/components/ui/empty-state';

export function TodaysPrioritiesWidget() {
  const [priorities, setPriorities] = useState<{ id: string; title: string; priority: string; status: string }[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('tasks').select('id, title, priority, status')
      .in('priority', ['critical', 'high'])
      .in('status', ['pending', 'in_progress'])
      .order('priority', { ascending: true })
      .limit(5)
      .then(({ data }) => { if (data) setPriorities(data as typeof priorities); });
  }, []);

  return (
    <WidgetCard
      title="Today's Priorities"
      icon={<SFBolt size={20} style={{ color: 'var(--bb-status-warning)' }} />}
    >
      <div className="space-y-3">
        {priorities.length === 0 ? (
          <EmptyState icon={<SFBolt size={32} />} title="No high-priority tasks" description="Enjoy the calm — nothing urgent right now." />
        ) : (
          priorities.map(task => (
            <div key={task.id} className="flex items-center gap-3 p-2 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                task.priority === 'critical'
                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              }`}>
                {task.priority}
              </span>
              <p className="text-xs font-medium truncate flex-1">{task.title}</p>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
