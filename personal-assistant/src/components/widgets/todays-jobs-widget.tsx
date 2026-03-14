'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SFCalendar } from 'sf-symbols-lib';
import { WidgetCard } from './widget-card';
import { EmptyState } from '@/components/ui/empty-state';

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
      icon={<SFCalendar size={20} style={{ color: 'var(--bb-status-info)' }} />}
    >
      <div className="space-y-3">
        {jobs.length === 0 ? (
          <EmptyState icon={<SFCalendar size={32} />} title="No jobs today" description="Scheduled jobs will appear here." />
        ) : (
          jobs.map(job => (
            <div key={job.id as string} className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{(job.title || job.description || 'Untitled Job') as string}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {job.scheduled_at ? new Date(job.scheduled_at as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                  {job.address ? ` · ${(job.address as string).slice(0, 30)}` : ''}
                </p>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {(job.status as string) || 'booked'}
              </span>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
