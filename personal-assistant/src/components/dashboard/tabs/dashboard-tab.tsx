'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DashboardRedesign } from '../dashboard-redesign';
import { TabSkeleton } from './tab-skeleton';
import { TabShell } from '@/components/ui/tab-shell';
import type { KanbanColumn, Task } from '@/lib/types';

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
      console.error('[dashboard-tab] fetch error:', err);
      setError('Failed to load dashboard data');
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  if (loading) return <TabSkeleton />;

  if (error) {
    return (
      <TabShell>
        <div className="bb-tab-error">
          <p className="bb-tab-error__text">{error}</p>
          <button className="bb-btn bb-btn--ghost bb-btn--sm" onClick={() => window.location.reload()}>
            Retry
          </button>
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
    <TabShell>
      <DashboardRedesign
        columns={columns}
        tasks={tasks}
        messages={messages}
        completedToday={completedToday}
        totalActive={activeTasks.length}
      />
    </TabShell>
  );
}

export default React.memo(DashboardTab);
