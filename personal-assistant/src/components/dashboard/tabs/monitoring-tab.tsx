'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

import { createClient } from '@/lib/supabase/client';
import { TabShell } from '@/components/ui/tab-shell';
import { TabSkeleton } from './tab-skeleton';
import { AlertBanner } from '@/components/ui/alert-banner';
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { IconAlertCircle, IconLoader2 } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CronStat {
  route: string;
  last_run: string | null;
  success_rate_24h: number;
  avg_duration_ms: number;
  error_count_24h: number;
}

interface AgentLatency {
  total_runs: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  error_rate: number;
}

interface ChannelHealthEntry {
  channel: string;
  status: string;
  latency_ms: number;
  last_sync: string | null;
  error_count_24h: number;
}

interface ErrorEntry {
  agent_type: string;
  count: number;
  latest_error: string;
  latest_at: string;
}

interface TokenSpendEntry {
  org_id: string;
  org_name: string;
  total_tokens_24h: number;
  total_cost_24h: number;
}

interface MonitoringData {
  cron_stats: CronStat[];
  agent_latency: AgentLatency;
  channel_health: ChannelHealthEntry[];
  error_summary: ErrorEntry[];
  token_spend: TokenSpendEntry[];
  generated_at: string;
}

interface SmokeTestResult {
  channel: string;
  status: 'pass' | 'fail' | 'skip';
  latencyMs: number;
  message: string;
  error?: string;
  testedAt: string;
}

interface SmokeTestReport {
  overall: 'pass' | 'fail' | 'partial';
  channels: SmokeTestResult[];
  duration_ms: number;
  testedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getToken(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'healthy':
    case 'pass':
      return 'default';
    case 'degraded':
    case 'partial':
    case 'skip':
      return 'outline';
    case 'down':
    case 'fail':
      return 'destructive';
    default:
      return 'secondary';
  }
}

function StatusDot({ status }: { status: string }) {
  return (
    <div className={cn(
      'size-2.5 shrink-0 rounded-full',
      (status === 'healthy' || status === 'pass') && 'bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.25)]',
      (status === 'degraded' || status === 'partial') && 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.25)]',
      status === 'skip' && 'bg-muted-foreground',
      (status === 'down' || status === 'fail') && 'bg-destructive shadow-[0_0_6px_rgba(239,68,68,0.25)]',
    )} />
  );
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MonitoringTab() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Smoke test state
  const [smokeLoading, setSmokeLoading] = useState(false);
  const [smokeReport, setSmokeReport] = useState<SmokeTestReport | null>(null);

  // Expanded DLQ items
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

  // Polling interval ref
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Init
  useEffect(() => {
    const c = createClient();
    if (!c) return;
    setClient(c);

    (async () => {
      const { data: { user } } = await c.auth.getUser();
      if (!user) { setIsAdmin(false); return; }
      const { data: profile } = await c.from('profiles').select('role').eq('id', user.id).single();
      setIsAdmin(profile?.role === 'admin');
    })();
  }, []);

  // Fetch monitoring data
  const fetchData = useCallback(async () => {
    if (!client) return;
    try {
      const token = await getToken(client);
      const res = await fetch('/api/admin/monitoring', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Fetch on admin confirmed + poll every 60s
  useEffect(() => {
    if (!isAdmin) return;
    fetchData();
    intervalRef.current = setInterval(fetchData, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAdmin, fetchData]);

  // Run smoke tests
  const runSmokeTests = useCallback(async () => {
    if (!client) return;
    setSmokeLoading(true);
    try {
      const token = await getToken(client);
      const res = await fetch('/api/admin/smoke-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const report: SmokeTestReport = await res.json();
      setSmokeReport(report);
    } catch {
      setSmokeReport({
        overall: 'fail',
        channels: [],
        duration_ms: 0,
        testedAt: new Date().toISOString(),
      });
    } finally {
      setSmokeLoading(false);
    }
  }, [client]);

  // Toggle error expansion
  const toggleError = useCallback((index: number) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // Guard
  if (isAdmin === null) return <TabSkeleton variant="table" />;
  if (!isAdmin) {
    return (
      <TabShell>
        <div className="p-8">
          <AlertBanner variant="error">
            <div>
              <h2 className="text-base font-medium text-foreground">Access Denied</h2>
              <p className="text-sm text-muted-foreground">Admin role required to access the monitoring dashboard.</p>
            </div>
          </AlertBanner>
        </div>
      </TabShell>
    );
  }

  // Compute overview stats
  const cronSuccessRate = data?.cron_stats
    ? Math.round(data.cron_stats.reduce((sum, c) => sum + c.success_rate_24h, 0) / Math.max(data.cron_stats.length, 1))
    : 0;
  const activeChannels = data?.channel_health?.filter(c => c.status === 'healthy').length ?? 0;
  const dlqCount = data?.error_summary?.reduce((sum, e) => sum + e.count, 0) ?? 0;

  return (
    <TabShell>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 p-6">

        {/* Error banner */}
        {error && (
          <Empty>
            <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
            <EmptyTitle>{"Couldn't load monitoring data"}</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
            </EmptyContent>
          </Empty>
        )}

        {/* Section 1: System Health Overview */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <Card className="py-4">
            <CardContent className="flex flex-col gap-1">
              <div className="text-sm text-muted-foreground">Cron Success Rate</div>
              <div className={cn(
                'text-3xl font-medium tabular-nums',
                cronSuccessRate >= 90 ? 'text-emerald-500' : cronSuccessRate >= 70 ? 'text-amber-500' : 'text-destructive'
              )}>
                {loading ? '--' : `${cronSuccessRate}%`}
              </div>
              <div className="text-sm text-muted-foreground">{data?.cron_stats.length ?? 0} routes monitored</div>
            </CardContent>
          </Card>

          <Card className="py-4">
            <CardContent className="flex flex-col gap-1">
              <div className="text-sm text-muted-foreground">Agent p95 Latency</div>
              <div className="text-3xl font-medium tabular-nums text-foreground">
                {loading ? '--' : `${(data?.agent_latency.p95_ms ?? 0).toLocaleString()}ms`}
              </div>
              <div className="text-sm text-muted-foreground">{data?.agent_latency.total_runs ?? 0} runs (24h)</div>
            </CardContent>
          </Card>

          <Card className="py-4">
            <CardContent className="flex flex-col gap-1">
              <div className="text-sm text-muted-foreground">Active Channels</div>
              <div className={cn(
                'text-3xl font-medium tabular-nums',
                activeChannels > 0 ? 'text-emerald-500' : 'text-foreground'
              )}>
                {loading ? '--' : activeChannels}
              </div>
              <div className="text-sm text-muted-foreground">of {data?.channel_health?.length ?? 0} configured</div>
            </CardContent>
          </Card>

          <Card className="py-4">
            <CardContent className="flex flex-col gap-1">
              <div className="text-sm text-muted-foreground">DLQ Items</div>
              <div className={cn(
                'text-3xl font-medium tabular-nums',
                dlqCount > 0 ? 'text-destructive' : 'text-emerald-500'
              )}>
                {loading ? '--' : dlqCount}
              </div>
              <div className="text-sm text-muted-foreground">unresolved errors</div>
            </CardContent>
          </Card>
        </div>

        {/* Section 2: Cron Route Status */}
        <Card className="py-0">
          <CardHeader className="flex-row items-center justify-between border-b border-border py-4">
            <CardTitle className="text-base">Cron Route Status</CardTitle>
            <span className="text-sm text-muted-foreground">
              {data ? `Updated ${relativeTime(data.generated_at)}` : ''}
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead className="text-right">Success</TableHead>
                  <TableHead className="text-right">Avg Duration</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.cron_stats ?? [])
                  .slice()
                  .sort((a, b) => b.error_count_24h - a.error_count_24h)
                  .map(cron => {
                    const status = cron.error_count_24h > 0 ? 'down' : cron.success_rate_24h >= 90 ? 'healthy' : cron.success_rate_24h > 0 ? 'degraded' : 'down';
                    return (
                      <TableRow key={cron.route}>
                        <TableCell className="font-mono text-sm">{cron.route}</TableCell>
                        <TableCell className="text-muted-foreground">{relativeTime(cron.last_run)}</TableCell>
                        <TableCell className={cn(
                          'text-right tabular-nums',
                          cron.success_rate_24h >= 90 ? 'text-emerald-500' : cron.success_rate_24h >= 70 ? 'text-amber-500' : 'text-destructive'
                        )}>
                          {cron.success_rate_24h}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {cron.avg_duration_ms > 0 ? `${cron.avg_duration_ms.toLocaleString()}ms` : '--'}
                        </TableCell>
                        <TableCell className={cn(
                          'text-right tabular-nums',
                          cron.error_count_24h > 0 ? 'font-medium text-destructive' : 'text-muted-foreground'
                        )}>
                          {cron.error_count_24h}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center">
                            <StatusDot status={status} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Loading cron data...
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Section 3: Channel Health + Smoke Tests */}
        <Card className="py-0">
          <CardHeader className="flex-row items-center justify-between border-b border-border py-4">
            <CardTitle className="text-base">Channel Health</CardTitle>
            <Button onClick={runSmokeTests} disabled={smokeLoading}>
              {smokeLoading ? (
                <>
                  <IconLoader2 className="size-3.5 animate-spin" />
                  Running...
                </>
              ) : 'Run Smoke Tests'}
            </Button>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {(() => {
                const channels = smokeReport
                  ? smokeReport.channels.map(ch => ({
                      channel: ch.channel,
                      status: ch.status,
                      latency_ms: ch.latencyMs,
                      message: ch.message,
                      error: ch.error,
                      last_sync: ch.testedAt,
                    }))
                  : (data?.channel_health ?? []).map(ch => ({
                      channel: ch.channel,
                      status: ch.status,
                      latency_ms: ch.latency_ms,
                      message: undefined as string | undefined,
                      error: undefined as string | undefined,
                      last_sync: ch.last_sync,
                    }));

                if (channels.length === 0 && !loading) {
                  return (
                    <div className="col-span-full text-sm text-muted-foreground">
                      No channel health data. Run smoke tests to check channel status.
                    </div>
                  );
                }

                return channels.map(ch => (
                  <div key={ch.channel} className="rounded-xl border border-border bg-muted p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <StatusDot status={ch.status} />
                      <span className="text-sm font-medium capitalize text-foreground">
                        {ch.channel}
                      </span>
                      <Badge variant={statusVariant(ch.status)} className="ml-auto uppercase">
                        {ch.status}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                      <div>Latency: {ch.latency_ms}ms</div>
                      <div>Last check: {relativeTime(ch.last_sync)}</div>
                      {ch.message && <div className="mt-1 text-sm">{ch.message}</div>}
                      {ch.error && <div className="mt-1 text-sm text-destructive">{ch.error}</div>}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Smoke test summary */}
            {smokeReport && (
              <div className={cn(
                'mt-4 flex items-center justify-between rounded-lg border p-3 text-sm text-muted-foreground',
                smokeReport.overall === 'pass' && 'border-emerald-500/30 bg-emerald-500/10',
                smokeReport.overall === 'partial' && 'border-amber-500/30 bg-amber-500/10',
                smokeReport.overall === 'fail' && 'border-destructive/30 bg-destructive/10',
              )}>
                <span>
                  Smoke test result:{' '}
                  <strong className={cn(
                    smokeReport.overall === 'pass' && 'text-emerald-500',
                    smokeReport.overall === 'partial' && 'text-amber-500',
                    smokeReport.overall === 'fail' && 'text-destructive',
                  )}>
                    {smokeReport.overall.toUpperCase()}
                  </strong>
                </span>
                <span>
                  {smokeReport.duration_ms}ms | {new Date(smokeReport.testedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 4: Error Log */}
        <Card className="py-0">
          <CardHeader className="flex-row items-center justify-between border-b border-border py-4">
            <CardTitle className="text-base">Error Log (DLQ)</CardTitle>
            <span className={cn(
              'text-sm',
              dlqCount > 0 ? 'font-medium text-destructive' : 'text-muted-foreground'
            )}>
              {dlqCount} unresolved
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {(data?.error_summary ?? []).length === 0 && !loading ? (
              <div className="p-5 text-center text-sm text-muted-foreground">
                No errors in the last 24 hours
              </div>
            ) : (
              <div>
                {(data?.error_summary ?? []).map((entry, idx) => (
                  <div
                    key={`${entry.agent_type}-${idx}`}
                    className="cursor-pointer border-b border-border px-5 py-3 last:border-b-0"
                    onClick={() => toggleError(idx)}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="destructive" className="shrink-0">
                        {entry.count}x
                      </Badge>
                      <span className="font-mono text-sm font-medium text-foreground">
                        {entry.agent_type}
                      </span>
                      <span className="ml-auto shrink-0 text-sm text-muted-foreground">
                        {relativeTime(entry.latest_at)}
                      </span>
                    </div>
                    <div className={cn(
                      'mt-1 text-sm text-muted-foreground',
                      expandedErrors.has(idx) ? 'whitespace-pre-wrap' : 'truncate'
                    )}>
                      {entry.latest_error}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 5: Token Spend */}
        <Card className="py-0">
          <CardHeader className="border-b border-border py-4">
            <CardTitle className="text-base">Token Spend (24h)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(data?.token_spend ?? []).length === 0 && !loading ? (
              <div className="p-5 text-center text-sm text-muted-foreground">
                No token usage in the last 24 hours
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Org</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost (USD)</TableHead>
                    <TableHead className="text-right">Bar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.token_spend ?? []).map(org => {
                    const maxCost = Math.max(...(data?.token_spend ?? []).map(o => o.total_cost_24h), 0.01);
                    const barWidth = Math.round((org.total_cost_24h / maxCost) * 100);
                    return (
                      <TableRow key={org.org_id}>
                        <TableCell className="font-mono text-sm">{org.org_name}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatTokenCount(org.total_tokens_24h)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          ${org.total_cost_24h.toFixed(4)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="ml-auto h-2 min-w-[80px] overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-300"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {/* Total cost */}
            {(data?.token_spend ?? []).length > 0 && (
              <div className="flex justify-end border-t border-border px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  Total: <strong className="text-foreground">
                    ${(data?.token_spend ?? []).reduce((sum, o) => sum + o.total_cost_24h, 0).toFixed(4)}
                  </strong>
                </span>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </TabShell>
  );
}
