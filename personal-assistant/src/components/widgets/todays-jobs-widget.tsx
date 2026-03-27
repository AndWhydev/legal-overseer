'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconCalendar } from '@tabler/icons-react';
import { WidgetCard } from './widget-card';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';

export function TodaysJobsWidget() {
  const [jobs, setJobs] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    supabase.from('jobs').select('*')
      .eq('status', 'booked')
      .gte('scheduled_at', todayStart.toISOString())
      .lte('scheduled_at', todayEnd.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(8)
      .then(({ data }) => { if (data) setJobs(data); });
  }, []);

  return (
    <WidgetCard
      title="Today's Jobs"
      subtitle={`${jobs.length} job${jobs.length !== 1 ? 's' : ''} scheduled`}
      icon={<IconCalendar size={20} className="text-sky-400" />}
    >
      <div className="flex flex-col gap-3">
        {jobs.length === 0 ? (
          <Empty><EmptyTitle>No jobs today</EmptyTitle><EmptyDescription>Scheduled jobs will appear here.</EmptyDescription></Empty>
        ) : (
          jobs.map(job => (
            <div key={job.id as string} className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{(job.title || job.description || 'Untitled Job') as string}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {job.scheduled_at ? new Date(job.scheduled_at as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                  {job.address ? ` · ${(job.address as string).slice(0, 30)}` : ''}
                </p>
              </div>
              <Badge variant="default" className="text-[10px]">
                {(job.status as string) || 'booked'}
              </Badge>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
