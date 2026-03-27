'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

import { createClient } from '@/lib/supabase/client';
import { TabShell } from '@/components/ui/tab-shell';
import { TabSkeleton } from './tab-skeleton';
import { AlertBanner } from '@/components/ui/alert-banner';
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
// Styles
// ---------------------------------------------------------------------------

const glassCard: React.CSSProperties = {
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.06))',
  borderRadius: 16,
};

const cardHeader: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const cardTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
};

const STATUS_COLORS: Record<string, string> = {
  healthy: '#22c55e',
  pass: '#22c55e',
  degraded: '#f59e0b',
  partial: '#f59e0b',
  skip: '#94a3b8',
  down: '#ef4444',
  fail: '#ef4444',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  background: 'var(--btn-primary-bg, #F1F5F9)',
  color: 'var(--btn-primary-fg, #0a0f1a)',
  border: 'none',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  fontSize: 14,
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
};

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

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#888';
  return (
    <div style={{
      width: 10,
      height: 10,
      borderRadius: 9999,
      background: color,
      boxShadow: `0 0 6px ${color}40`,
      flexShrink: 0,
    }} />
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
    } catch (err) {
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
  if (isAdmin === null) return <TabSkeleton />;
  if (!isAdmin) {
    return (
      <TabShell>
        <div style={{ padding: 32 }}>
          <AlertBanner variant="error">
            <div>
              <h2 style={{ color: 'var(--text-primary)', fontSize: 16, marginBottom: 4, fontWeight: 500 }}>Access Denied</h2>
              <p style={{ color: 'var(--text-secondary)' }}>Admin role required to access the monitoring dashboard.</p>
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
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Error banner */}
        {error && (
          <AlertBanner variant="warning">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span>Failed to load monitoring data: {error}</span>
              <button onClick={fetchData} style={btnSecondary}>Retry</button>
            </div>
          </AlertBanner>
        )}

        {/* ── Section 1: System Health Overview ──────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {/* Cron Success Rate */}
          <div style={glassCard}>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Cron Success Rate</div>
              <div style={{
                fontSize: 32,
                fontWeight: 600,
                color: cronSuccessRate >= 90 ? '#22c55e' : cronSuccessRate >= 70 ? '#f59e0b' : '#ef4444',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {loading ? '--' : `${cronSuccessRate}%`}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                {data?.cron_stats.length ?? 0} routes monitored
              </div>
            </div>
          </div>

          {/* Agent p95 Latency */}
          <div style={glassCard}>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Agent p95 Latency</div>
              <div style={{
                fontSize: 32,
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {loading ? '--' : `${(data?.agent_latency.p95_ms ?? 0).toLocaleString()}ms`}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                {data?.agent_latency.total_runs ?? 0} runs (24h)
              </div>
            </div>
          </div>

          {/* Active Channels */}
          <div style={glassCard}>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Active Channels</div>
              <div style={{
                fontSize: 32,
                fontWeight: 600,
                color: activeChannels > 0 ? '#22c55e' : 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {loading ? '--' : activeChannels}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                of {data?.channel_health?.length ?? 0} configured
              </div>
            </div>
          </div>

          {/* DLQ Items */}
          <div style={glassCard}>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>DLQ Items</div>
              <div style={{
                fontSize: 32,
                fontWeight: 600,
                color: dlqCount > 0 ? '#ef4444' : '#22c55e',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {loading ? '--' : dlqCount}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                unresolved errors
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 2: Cron Route Status ───────────────────────────────── */}
        <div style={glassCard}>
          <div style={cardHeader}>
            <span style={cardTitle}>Cron Route Status</span>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {data ? `Updated ${relativeTime(data.generated_at)}` : ''}
            </span>
          </div>
          <div style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>Route</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>Last Run</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>Success</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>Avg Duration</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>Errors</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 500 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.cron_stats ?? [])
                  .slice()
                  .sort((a, b) => b.error_count_24h - a.error_count_24h)
                  .map(cron => {
                    const status = cron.error_count_24h > 0 ? 'down' : cron.success_rate_24h >= 90 ? 'healthy' : cron.success_rate_24h > 0 ? 'degraded' : 'down';
                    return (
                      <tr key={cron.route} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                        <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13 }}>
                          {cron.route}
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>
                          {relativeTime(cron.last_run)}
                        </td>
                        <td style={{
                          padding: '10px 16px',
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: cron.success_rate_24h >= 90 ? '#22c55e' : cron.success_rate_24h >= 70 ? '#f59e0b' : '#ef4444',
                        }}>
                          {cron.success_rate_24h}%
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {cron.avg_duration_ms > 0 ? `${cron.avg_duration_ms.toLocaleString()}ms` : '--'}
                        </td>
                        <td style={{
                          padding: '10px 16px',
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: cron.error_count_24h > 0 ? '#ef4444' : 'var(--text-secondary)',
                          fontWeight: cron.error_count_24h > 0 ? 600 : 400,
                        }}>
                          {cron.error_count_24h}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <StatusDot status={status} />
                        </td>
                      </tr>
                    );
                  })}
                {loading && (
                  <tr>
                    <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Loading cron data...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Section 3: Channel Health + Smoke Tests ────────────────────── */}
        <div style={glassCard}>
          <div style={cardHeader}>
            <span style={cardTitle}>Channel Health</span>
            <button
              onClick={runSmokeTests}
              disabled={smokeLoading}
              style={{
                ...btnPrimary,
                opacity: smokeLoading ? 0.6 : 1,
              }}
            >
              {smokeLoading ? (
                <>
                  <span style={{
                    width: 14,
                    height: 14,
                    border: '2px solid transparent',
                    borderTopColor: 'currentColor',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    display: 'inline-block',
                  }} />
                  Running...
                </>
              ) : 'Run Smoke Tests'}
            </button>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {/* Render from smoke report if available, otherwise from monitoring data */}
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
                    <div style={{ color: 'var(--text-secondary)', fontSize: 14, gridColumn: '1 / -1' }}>
                      No channel health data. Run smoke tests to check channel status.
                    </div>
                  );
                }

                return channels.map(ch => (
                  <div key={ch.channel} style={{
                    padding: 16,
                    borderRadius: 12,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <StatusDot status={ch.status} />
                      <span style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                        {ch.channel}
                      </span>
                      <span style={{
                        marginLeft: 'auto',
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        background: `${STATUS_COLORS[ch.status] || '#888'}20`,
                        color: STATUS_COLORS[ch.status] || '#888',
                        textTransform: 'uppercase',
                      }}>
                        {ch.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <div>Latency: {ch.latency_ms}ms</div>
                      <div>Last check: {relativeTime(ch.last_sync)}</div>
                      {ch.message && <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>{ch.message}</div>}
                      {ch.error && <div style={{ marginTop: 4, fontSize: 13, color: '#ef4444' }}>{ch.error}</div>}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Smoke test summary */}
            {smokeReport && (
              <div style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 8,
                background: `${STATUS_COLORS[smokeReport.overall] || '#888'}10`,
                border: `1px solid ${STATUS_COLORS[smokeReport.overall] || '#888'}30`,
                fontSize: 14,
                color: 'var(--text-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span>
                  Smoke test result:{' '}
                  <strong style={{ color: STATUS_COLORS[smokeReport.overall] || '#888' }}>
                    {smokeReport.overall.toUpperCase()}
                  </strong>
                </span>
                <span>
                  {smokeReport.duration_ms}ms | {new Date(smokeReport.testedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Section 4: Error Log ───────────────────────────────────────── */}
        <div style={glassCard}>
          <div style={cardHeader}>
            <span style={cardTitle}>Error Log (DLQ)</span>
            <span style={{ fontSize: 14, color: dlqCount > 0 ? '#ef4444' : 'var(--text-secondary)', fontWeight: dlqCount > 0 ? 600 : 400 }}>
              {dlqCount} unresolved
            </span>
          </div>
          <div style={{ padding: 0 }}>
            {(data?.error_summary ?? []).length === 0 && !loading ? (
              <div style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center' }}>
                No errors in the last 24 hours
              </div>
            ) : (
              <div>
                {(data?.error_summary ?? []).map((entry, idx) => (
                  <div
                    key={`${entry.agent_type}-${idx}`}
                    style={{
                      padding: '12px 20px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleError(idx)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        background: '#ef444420',
                        color: '#ef4444',
                        flexShrink: 0,
                      }}>
                        {entry.count}x
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        {entry.agent_type}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--text-secondary)', flexShrink: 0 }}>
                        {relativeTime(entry.latest_at)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 14,
                      color: 'var(--text-secondary)',
                      marginTop: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: expandedErrors.has(idx) ? 'pre-wrap' : 'nowrap',
                      maxHeight: expandedErrors.has(idx) ? 'none' : '1.4em',
                    }}>
                      {entry.latest_error}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Section 5: Token Spend ─────────────────────────────────────── */}
        <div style={glassCard}>
          <div style={cardHeader}>
            <span style={cardTitle}>Token Spend (24h)</span>
          </div>
          <div style={{ padding: 0 }}>
            {(data?.token_spend ?? []).length === 0 && !loading ? (
              <div style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center' }}>
                No token usage in the last 24 hours
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>Org</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>Tokens</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>Cost (USD)</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.token_spend ?? []).map(org => {
                    const maxCost = Math.max(...(data?.token_spend ?? []).map(o => o.total_cost_24h), 0.01);
                    const barWidth = Math.round((org.total_cost_24h / maxCost) * 100);
                    return (
                      <tr key={org.org_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                        <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13 }}>
                          {org.org_name}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatTokenCount(org.total_tokens_24h)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                          ${org.total_cost_24h.toFixed(4)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          <div style={{
                            height: 8,
                            borderRadius: 4,
                            background: 'var(--bg-elevated)',
                            overflow: 'hidden',
                            minWidth: 80,
                          }}>
                            <div style={{
                              width: `${barWidth}%`,
                              height: '100%',
                              borderRadius: 4,
                              background: 'var(--accent-subtle, #3b82f6)',
                              transition: 'width 0.3s ease',
                            }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Total cost */}
            {(data?.token_spend ?? []).length > 0 && (
              <div style={{
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 24,
                fontSize: 14,
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Total: <strong style={{ color: 'var(--text-primary)' }}>
                    ${(data?.token_spend ?? []).reduce((sum, o) => sum + o.total_cost_24h, 0).toFixed(4)}
                  </strong>
                </span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </TabShell>
  );
}
