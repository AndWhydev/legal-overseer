'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { IconActivity } from '@tabler/icons-react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';

interface RunningAgent {
  id: string;
  agent_type: string;
  started_at: string;
  agent_configs?: { name: string | null } | null;
}

/**
 * Shows which agents are currently running with a live pulse animation.
 * Reads from agent_runs where status='running'.
 */
export function AgentStatusIndicator() {
  const [runningAgents, setRunningAgents] = useState<RunningAgent[]>([]);

  const fetchRunning = useCallback(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase
      .from('agent_runs')
      .select('id, agent_type, started_at, agent_configs(name)')
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setRunningAgents(data as unknown as RunningAgent[]);
      });
  }, []);

  useEffect(() => {
    fetchRunning();
  }, [fetchRunning]);

  // Re-fetch on any agent_runs change
  useRealtimeSubscription('agent_runs', { event: '*' }, fetchRunning);

  if (runningAgents.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground">
        <div className="w-2 h-2 rounded-full bg-zinc-500" />
        <span>All agents idle</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {runningAgents.map((agent) => (
        <div
          key={agent.id}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs"
        >
          <div className="relative flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
          </div>
          <IconActivity size={14} className="text-cyan-400 shrink-0" />
          <span className="font-medium truncate">
            {agent.agent_configs?.name || agent.agent_type}
          </span>
          <span className="text-muted-foreground ml-auto flex-shrink-0">
            {formatElapsed(agent.started_at)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatElapsed(startedAt: string): string {
  const elapsed = Date.now() - new Date(startedAt).getTime();
  const secs = Math.floor(elapsed / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default AgentStatusIndicator;
