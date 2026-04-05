'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconBolt } from '@tabler/icons-react';
import { WidgetCard } from './widget-card';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';

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
      icon={<IconBolt size={20} className="text-muted-foreground" />}
    >
      <div className="flex flex-col gap-3">
        {priorities.length === 0 ? (
          <Empty><EmptyTitle>No high-priority tasks</EmptyTitle><EmptyDescription>Enjoy the calm — nothing urgent right now.</EmptyDescription></Empty>
        ) : (
          priorities.map(task => (
            <div key={task.id} className="flex items-center gap-3 p-2 rounded-xl bg-muted border border-border">
              <Badge
                variant={task.priority === 'critical' ? 'destructive' : 'secondary'}
                className="text-sm"
              >
                {task.priority}
              </Badge>
              <p className="text-sm font-medium truncate flex-1">{task.title}</p>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
