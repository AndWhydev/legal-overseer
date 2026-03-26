'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle } from 'lucide-react';
import { WidgetCard } from './widget-card';
import { EmptyState } from '@/components/ui/empty-state';

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
      icon={<AlertCircle size={20} style={{ color: 'var(--bb-status-error)' }} />}
    >
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <EmptyState title="No overdue tasks" description="You're all caught up." />
        ) : (
          tasks.map(task => (
            <div key={task.id as string} className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{(task.title || 'Untitled Task') as string}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Due: {task.due_date ? new Date(task.due_date as string).toLocaleDateString() : '--'}
                </p>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                overdue
              </span>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
