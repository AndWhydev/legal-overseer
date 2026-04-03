'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { KanbanBoard } from '../kanban-board';
import { TabSkeleton } from './tab-skeleton';
import { TabShell } from '@/components/ui/tab-shell';
import { Button } from '@/components/ui/button';
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { IconAlertCircle } from '@tabler/icons-react';
import type { KanbanColumn, Task } from '@/lib/types';
import { logger } from '@/lib/core/logger';

function TasksTab() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const doneColumnId = useMemo(
    () => columns.find((column) => column.title?.toLowerCase() === 'done')?.id ?? null,
    [columns]
  );

  const openTasks = tasks.filter((task) => task.column_id !== doneColumnId).length;
  const overdueTasks = tasks.filter((task) => {
    const deadline = (task.metadata as Record<string, unknown>)?.deadline;
    if (typeof deadline !== 'string' || !deadline) return false;
    return new Date(deadline).getTime() < currentTime && task.column_id !== doneColumnId;
  }).length;
  const aiActiveTasks = tasks.filter((task) => {
    const status = (task.metadata as Record<string, unknown>)?.agentStatus;
    return task.assigned_to && status === 'working';
  }).length;
  const completionRate = tasks.length === 0
    ? 0
    : Math.round(((tasks.length - openTasks) / tasks.length) * 100);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      queueMicrotask(() => setLoading(false));
      return;
    }

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

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setCurrentTime(Date.now());
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [tasks, columns]);

  if (loading) return <TabSkeleton variant="kanban" />;

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
    <TabShell variant="fixed" padding="p-0" className="bg-background">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-border/70 bg-linear-to-br from-background via-background to-primary/5 px-6 py-6">
          <a
            href="#tasks-board"
            className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-4 focus:z-10 focus:rounded-lg focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:shadow-md"
          >
            Skip to task board
          </a>

          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Tasks
              </p>
              <h1 className="text-3xl font-medium tracking-tight text-foreground">
                Shape the day around the work that matters.
              </h1>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Plan across columns, keep urgent items visible, and let BitBit support the busy work without
                overwhelming the board.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card size="sm" className="min-w-[11rem] bg-background shadow-sm">
                <CardHeader className="pb-0">
                  <CardDescription>Open</CardDescription>
                  <CardTitle>{openTasks}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  Still in motion across the board.
                </CardContent>
              </Card>

              <Card size="sm" className="min-w-[11rem] bg-background shadow-sm">
                <CardHeader className="pb-0">
                  <CardDescription>Overdue</CardDescription>
                  <CardTitle>{overdueTasks}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  Tasks with a passed deadline.
                </CardContent>
              </Card>

              <Card size="sm" className="min-w-[11rem] bg-background shadow-sm">
                <CardHeader className="pb-0">
                  <CardDescription>BitBit Active</CardDescription>
                  <CardTitle>{aiActiveTasks}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  Work currently being handled by agents.
                </CardContent>
              </Card>

              <Card size="sm" className="min-w-[11rem] bg-background shadow-sm">
                <CardHeader className="pb-0">
                  <CardDescription>Completion</CardDescription>
                  <CardTitle>{completionRate}%</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  Based on tasks already in the done column.
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 p-4 sm:p-6">
          <section
            id="tasks-board"
            aria-labelledby="tasks-board-title"
            className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-border/70 bg-linear-to-b from-background via-background to-muted/40 shadow-[0_20px_50px_-32px_rgba(0,0,0,0.65)]"
          >
            <h2 id="tasks-board-title" className="sr-only">
              Task board
            </h2>
            <KanbanBoard initialColumns={columns} initialTasks={tasks} doneColumnId={doneColumnId ?? undefined} />
          </section>
        </div>
      </div>
    </TabShell>
  );
}

export default React.memo(TasksTab);
