'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { KanbanBoard } from '../kanban-board';
import { TabSkeleton } from './tab-skeleton';
import { TabShell } from '@/components/ui/tab-shell';
import { Button } from '@/components/ui/button';
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { IconAlertCircle } from '@tabler/icons-react';
import type { KanbanColumn, Task } from '@/lib/types';
import { logger } from '@/lib/core/logger';

function TasksTab() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    Promise.all([
      supabase.from('kanban_columns').select('*').order('position', { ascending: true }).limit(50),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(500),
    ]).then(([colRes, taskRes]) => {
      setColumns((colRes.data ?? []) as KanbanColumn[]);
      setTasks((taskRes.data ?? []) as Task[]);
    }).catch((err) => {
      logger.error('[tasks-tab] fetch error:', err);
      setError('Failed to load tasks');
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  if (loading) return <TabSkeleton />;

  if (error) {
    return (
      <TabShell>
        <Empty className="py-12">
          <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
          </EmptyContent>
        </Empty>
      </TabShell>
    );
  }

  return (
    <TabShell variant="fixed" padding="p-0">
      <div className="flex h-full flex-col overflow-hidden p-6">
        <KanbanBoard initialColumns={columns} initialTasks={tasks} />
      </div>
    </TabShell>
  );
}

export default React.memo(TasksTab);
