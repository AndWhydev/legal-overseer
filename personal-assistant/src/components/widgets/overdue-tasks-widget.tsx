'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconAlertCircle } from '@tabler/icons-react';
import { WidgetCard } from './widget-card';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';

export function OverdueTasksWidget() {
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('tasks').select('*')
      .eq('status', 'todo')
      .lt('due_date', new Date().toISOString())
      .limit(5)
      .then(({ data }) => { if (data) setTasks(data); });
  }, []);

  return (
    <WidgetCard
      title="Overdue Tasks"
      subtitle={`${tasks.length} overdue`}
      icon={<IconAlertCircle size={20} className="text-destructive" />}
    >
      <div className="flex flex-col gap-3">
        {tasks.length === 0 ? (
          <Empty><EmptyTitle>No overdue tasks</EmptyTitle><EmptyDescription>You're all caught up.</EmptyDescription></Empty>
        ) : (
          tasks.map(task => (
            <div key={task.id as string} className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{(task.title || 'Untitled Task') as string}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Due: {task.due_date ? new Date(task.due_date as string).toLocaleDateString() : '--'}
                </p>
              </div>
              <Badge variant="destructive" className="text-[10px]">
                overdue
              </Badge>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
