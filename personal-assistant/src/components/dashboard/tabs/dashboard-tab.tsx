'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DashboardRedesign } from '../dashboard-redesign';
import { TabSkeleton } from './tab-skeleton';
import { TabShell } from '@/components/ui/tab-shell';
import { TabHeader } from '@/components/ui/tab-header';
import { CheckSquare } from 'lucide-react';
import type { KanbanColumn, Task } from '@/lib/types';

function DashboardTab() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    Promise.all([
      supabase.from('kanban_columns').select('*').order('position'),
      supabase.from('tasks').select('*').order('position'),
      supabase.from('channel_messages').select('*').order('received_at', { ascending: false }).limit(20)
    ]).then(([colRes, taskRes, msgRes]) => {
      setColumns((colRes.data ?? []) as KanbanColumn[]);
      setTasks((taskRes.data ?? []) as Task[]);
      setMessages(msgRes.data ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) return <TabSkeleton />;

  const today = new Date().toISOString().split('T')[0];
  const completedToday = tasks.filter(t =>
    t.status === 'completed' && t.updated_at?.startsWith(today)
  ).length;
  const activeTasks = tasks.filter(t => t.status !== 'archived');

  return (
    <TabShell>
      <TabHeader
        icon={<CheckSquare size={22} />}
        iconColor="var(--bb-orange)"
        title="Tasks"
        subtitle={`${activeTasks.length} active tasks · ${completedToday} completed today`}
      />
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
