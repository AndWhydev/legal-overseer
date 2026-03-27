'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { IconActivity } from '@tabler/icons-react';
import { WidgetCard } from './widget-card';
import { EmptyState } from '@/components/ui/empty-state';

interface AgentRun {
  id: string;
  output_summary: string;
  created_at: string;
  agent_configs?: { name: string | null; agent_type: string } | null;
}

export function AgentActivityWidget() {
  const [runs, setRuns] = useState<AgentRun[]>([]);

  const load = useCallback(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('agent_runs')
      .select('id, output_summary, created_at, agent_configs(name, agent_type)')
      .order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => { if (data) setRuns(data as unknown as AgentRun[]); });
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeSubscription('agent_runs', { event: '*' }, load);

  return (
    <WidgetCard
      title="Agent Activity"
      subtitle="Recent agent runs"
      icon={<IconActivity size={20} className="text-cyan-400" />}
    >
      <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
        {runs.length === 0 ? (
          <EmptyState title="No recent agent activity" description="Agents will appear here when they run." />
        ) : (
          runs.map(run => (
            <div key={run.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
              <div className="w-2 h-2 rounded-full bg-cyan-400 mt-2 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {run.agent_configs?.name || run.agent_configs?.agent_type || 'Agent'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{run.output_summary}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
