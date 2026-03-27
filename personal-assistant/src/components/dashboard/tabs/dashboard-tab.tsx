'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DashboardRedesign } from '../dashboard-redesign';
import { TabSkeleton } from './tab-skeleton';
import { TabShell } from '@/components/ui/tab-shell';
import { DailyTipBanner } from '@/components/beta/daily-tip-banner';
import { Button } from '@/components/ui/button';
import type { KanbanColumn, Task } from '@/lib/types';
import { logger } from '@/lib/core/logger';

function DashboardTab() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    Promise.all([
      supabase.from('kanban_columns').select('*').order('position', { ascending: true }).limit(50),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('channel_messages').select('*').order('received_at', { ascending: false }).limit(20)
    ]).then(([colRes, taskRes, msgRes]) => {
      setColumns((colRes.data ?? []) as KanbanColumn[]);
      setTasks((taskRes.data ?? []) as Task[]);
      setMessages(msgRes.data ?? []);
    }).catch((err) => {
      logger.error('[dashboard-tab] fetch error:', err);
      setError('Failed to load dashboard data');
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  if (loading) return <TabSkeleton />;

  if (error) {
    return (
      <TabShell>
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </TabShell>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const completedToday = tasks.filter(t =>
    t.status === 'completed' && t.updated_at?.startsWith(today)
  ).length;
  const activeTasks = tasks.filter(t => t.status !== 'archived');

  return (
    <TabShell variant="fixed" padding="p-0">
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
        <DailyTipBanner />
        <DashboardRedesign
          columns={columns}
          tasks={tasks}
          messages={messages}
          completedToday={completedToday}
          totalActive={activeTasks.length}
        />
      </div>
    </TabShell>
  );
}

export default React.memo(DashboardTab);
