'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/core/logger';

interface AppData {
  tasks: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  channelMessages: Record<string, unknown>[];
  agentRuns: Record<string, unknown>[];
  kanbanColumns: Record<string, unknown>[];
  isReady: boolean;
  refresh: (table?: string) => void;
}

const AppDataContext = createContext<AppData>({
  tasks: [],
  approvals: [],
  leads: [],
  channelMessages: [],
  agentRuns: [],
  kanbanColumns: [],
  isReady: false,
  refresh: () => {},
});

export function useAppData() {
  return useContext(AppDataContext);
}

interface AppDataProviderProps {
  children: React.ReactNode;
  onReady?: () => void;
}

export function AppDataProvider({ children, onReady }: AppDataProviderProps) {
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [approvals, setApprovals] = useState<Record<string, unknown>[]>([]);
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [channelMessages, setChannelMessages] = useState<Record<string, unknown>[]>([]);
  const [agentRuns, setAgentRuns] = useState<Record<string, unknown>[]>([]);
  const [kanbanColumns, setKanbanColumns] = useState<Record<string, unknown>[]>([]);
  const [isReady, setIsReady] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) {
      setIsReady(true);
      onReadyRef.current?.();
      return;
    }

    try {
      const [tasksRes, approvalsRes, leadsRes, messagesRes, runsRes, columnsRes] = await Promise.all([
        supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('approval_queue').select('*').eq('status', 'pending').limit(20),
        supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('channel_messages').select('*').order('received_at', { ascending: false }).limit(50),
        supabase.from('agent_runs').select('id, output_summary, created_at, agent_configs(name, agent_type)').order('created_at', { ascending: false }).limit(20),
        supabase.from('kanban_columns').select('*').order('position', { ascending: true }).limit(50),
      ]);

      setTasks(tasksRes.data || []);
      setApprovals(approvalsRes.data || []);
      setLeads(leadsRes.data || []);
      setChannelMessages(messagesRes.data || []);
      setAgentRuns(runsRes.data || []);
      setKanbanColumns(columnsRes.data || []);
    } catch (err) {
      logger.error('[AppDataProvider] prefetch error:', err);
    } finally {
      setIsReady(true);
      onReadyRef.current?.();
    }
  }, []);

  // Refresh a specific table or all
  const refresh = useCallback((table?: string) => {
    const supabase = createClient();
    if (!supabase) return;

    if (!table) {
      fetchAll();
      return;
    }

    const refreshMap: Record<string, () => void> = {
      tasks: () => supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(100).then(({ data }) => data && setTasks(data)),
      approval_queue: () => supabase.from('approval_queue').select('*').eq('status', 'pending').limit(20).then(({ data }) => data && setApprovals(data)),
      leads: () => supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(50).then(({ data }) => data && setLeads(data)),
      channel_messages: () => supabase.from('channel_messages').select('*').order('received_at', { ascending: false }).limit(50).then(({ data }) => data && setChannelMessages(data)),
      agent_runs: () => supabase.from('agent_runs').select('id, output_summary, created_at, agent_configs(name, agent_type)').order('created_at', { ascending: false }).limit(20).then(({ data }) => data && setAgentRuns(data)),
    };

    refreshMap[table]?.();
  }, [fetchAll]);

  // Initial fetch
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Consolidated realtime subscriptions
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel('app-data-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => refresh('tasks'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_queue' }, () => refresh('approval_queue'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => refresh('leads'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages' }, () => refresh('channel_messages'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_runs' }, () => refresh('agent_runs'))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Safety timeout - don't block splash for more than 3s
   
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isReady) {
        setIsReady(true);
        onReadyRef.current?.();
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const contextValue = useMemo(
    () => ({ tasks, approvals, leads, channelMessages, agentRuns, kanbanColumns, isReady, refresh }),
    [tasks, approvals, leads, channelMessages, agentRuns, kanbanColumns, isReady, refresh],
  );

  return (
    <AppDataContext.Provider value={contextValue}>
      {children}
    </AppDataContext.Provider>
  );
}
