'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { SFDollarsignCircle, SFArrowUpRight, SFExclamationmarkTriangle, SFChartBar, SFBolt } from 'sf-symbols-lib';
import { TabShell } from '@/components/ui/tab-shell';
import { AlertBanner } from '@/components/ui/alert-banner';
import { EmptyState } from '@/components/ui/empty-state';

interface CostEntry {
  model: string;
  agent_type: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  run_count: number;
}

interface CostSummary {
  period: string;
  total_cost_usd: number;
  total_runs: number;
  total_input_tokens: number;
  total_output_tokens: number;
  by_model: CostEntry[];
  by_agent: CostEntry[];
  daily_trend: Array<{ date: string; cost_usd: number; runs: number }>;
}

interface BudgetAlerts {
  daily_exceeded: boolean;
  monthly_exceeded: boolean;
  daily_pct: number;
  monthly_pct: number;
}

type Period = 'today' | '7d' | '30d' | 'month';

function formatUSD(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function CostsTab() {
  const [period, setPeriod] = useState<Period>('30d');
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [alerts, setAlerts] = useState<BudgetAlerts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCosts = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/monitoring/costs?period=${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data.summary);
      setAlerts(data.alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load costs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCosts(period);
  }, [period, fetchCosts]);

  // Inline style definitions
  const containerPadding: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    padding: 24,
  };

  const periodSelectorContainer: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    padding: 8,
    borderRadius: 12,
    background: 'rgba(13, 17, 23, 0.6)',
    backdropFilter: 'var(--glass-card-blur)',
    WebkitBackdropFilter: 'var(--glass-card-blur)',
    width: 'fit-content',
  };

  const pillBtn = (isActive: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 20,
    background: isActive ? 'rgba(255, 90, 31, 0.15)' : 'var(--glass-pill-bg)',
    backdropFilter: 'var(--glass-card-blur)',
    WebkitBackdropFilter: 'var(--glass-card-blur)',
    boxShadow: 'var(--glass-card-inset)',
    border: 'none',
    fontSize: 12,
    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 200ms',
    fontWeight: isActive ? 600 : 500,
  });

  const budgetAlertStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 20px',
    borderRadius: 12,
    background: 'rgba(234, 179, 8, 0.12)',
    backdropFilter: 'var(--glass-card-blur)',
    WebkitBackdropFilter: 'var(--glass-card-blur)',
    border: '1px solid rgba(234, 179, 8, 0.3)',
    boxShadow: 'var(--glass-card-inset)',
  };

  const budgetAlertText: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--text-primary)',
  };

  const glassCard: React.CSSProperties = {
    padding: 20,
    borderRadius: 16,
    background: 'var(--glass-card-bg)',
    backdropFilter: 'var(--glass-card-blur)',
    WebkitBackdropFilter: 'var(--glass-card-blur)',
    border: '1px solid var(--glass-card-border)',
    boxShadow: 'var(--glass-card-inset)',
  };

  const sectionHeader: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-dim)',
    marginBottom: 16,
  };

  const listRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 18px',
    borderRadius: 12,
    background: 'var(--glass-pill-bg)',
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    boxShadow: 'var(--glass-card-inset)',
    border: 'none',
    transition: 'background 200ms',
  };

  const loadingContainer: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingBottom: 48,
  };

  const loadingText: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--text-secondary)',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  };

  const summaryGrid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
  };

  const dailyTrendContainer: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  const dailyTrendRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    fontSize: 12,
  };

  const dailyTrendDate: React.CSSProperties = {
    width: 80,
    color: 'var(--text-secondary)',
    flexShrink: 0,
  };

  const dailyTrendBarContainer: React.CSSProperties = {
    flex: 1,
    height: 16,
    borderRadius: 8,
    background: 'var(--glass-pill-bg)',
    backdropFilter: 'var(--glass-card-blur)',
    WebkitBackdropFilter: 'var(--glass-card-blur)',
    overflow: 'hidden',
    border: '1px solid var(--glass-card-border)',
  };

  const dailyTrendBar = (pct: number): React.CSSProperties => ({
    height: '100%',
    width: `${pct}%`,
    background: 'rgba(34, 197, 94, 0.4)',
    borderRadius: 8,
    transition: 'width 300ms ease-out',
  });

  const dailyTrendValue: React.CSSProperties = {
    width: 64,
    textAlign: 'right',
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    fontWeight: 600,
    color: 'var(--text-primary)',
    flexShrink: 0,
  };

  const listRowLabel: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--text-primary)',
  };

  const listRowMeta: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    fontSize: 12,
  };

  const listRowSecondary: React.CSSProperties = {
    color: 'var(--text-secondary)',
  };

  const listRowValue: React.CSSProperties = {
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    fontWeight: 600,
    color: 'var(--text-primary)',
  };

  const emptyState: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--text-secondary)',
    padding: '12px 18px',
  };

  return (
    <TabShell>
      <div style={containerPadding}>
        {/* Period selector */}
        <div style={periodSelectorContainer}>
          {(['today', '7d', '30d', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={pillBtn(period === p)}
            >
              {p === 'today' ? 'Today' : p === 'month' ? 'This Month' : p}
            </button>
          ))}
        </div>

        {/* Budget Alerts */}
        {alerts && (alerts.daily_exceeded || alerts.monthly_exceeded) && (
          <div style={budgetAlertStyle}>
            <SFExclamationmarkTriangle size={20} style={{ color: '#eab308', flexShrink: 0 }} />
            <div style={budgetAlertText}>
              {alerts.daily_exceeded && (
                <p style={{ margin: 0, marginBottom: alerts.monthly_exceeded ? 4 : 0 }}>
                  Daily spend at <strong>{alerts.daily_pct}%</strong> of budget
                </p>
              )}
              {alerts.monthly_exceeded && (
                <p style={{ margin: 0 }}>
                  Monthly spend at <strong>{alerts.monthly_pct}%</strong> of budget
                </p>
              )}
            </div>
          </div>
        )}

        {loading && (
          <div style={loadingContainer}>
            <div style={loadingText}>Loading cost data...</div>
          </div>
        )}

        {error && (
          <AlertBanner variant="error">{error}</AlertBanner>
        )}

        {!summary && !loading && !error && (
          <EmptyState
            icon={<SFBolt size={40} />}
            title="No cost data available"
            description="Cost tracking will appear here once you start using AI agents and models."
          />
        )}

        {summary && !loading && (
          <>
            {/* Summary Cards */}
            <div style={summaryGrid}>
              <SummaryCard
                icon={<SFDollarsignCircle size={16} />}
                label="Total Cost"
                value={formatUSD(summary.total_cost_usd)}
              />
              <SummaryCard
                icon={<SFChartBar size={16} />}
                label="Total Runs"
                value={String(summary.total_runs)}
              />
              <SummaryCard
                icon={<SFArrowUpRight size={16} />}
                label="Input Tokens"
                value={formatTokens(summary.total_input_tokens)}
              />
              <SummaryCard
                icon={<SFArrowUpRight size={16} />}
                label="Output Tokens"
                value={formatTokens(summary.total_output_tokens)}
              />
            </div>

            {/* Cost by Agent */}
            <div style={glassCard}>
              <h2 style={sectionHeader}>Cost by Agent</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {summary.by_agent.map((entry) => (
                  <div key={entry.agent_type} style={listRow}>
                    <span style={listRowLabel}>{entry.agent_type}</span>
                    <div style={listRowMeta}>
                      <span style={listRowSecondary}>{entry.run_count} runs</span>
                      <span style={listRowSecondary}>{formatTokens(entry.input_tokens + entry.output_tokens)} tok</span>
                      <span style={listRowValue}>{formatUSD(entry.cost_usd)}</span>
                    </div>
                  </div>
                ))}
                {summary.by_agent.length === 0 && (
                  <p style={emptyState}>No data for this period</p>
                )}
              </div>
            </div>

            {/* Daily Trend */}
            {summary.daily_trend.length > 0 && (
              <div style={glassCard}>
                <h2 style={sectionHeader}>Daily Trend</h2>
                <div style={dailyTrendContainer}>
                  {summary.daily_trend.map((day) => {
                    const maxCost = Math.max(...summary.daily_trend.map((d) => d.cost_usd), 0.01);
                    const pct = (day.cost_usd / maxCost) * 100;
                    return (
                      <div key={day.date} style={dailyTrendRow}>
                        <span style={dailyTrendDate}>{day.date.slice(5)}</span>
                        <div style={dailyTrendBarContainer}>
                          <div style={dailyTrendBar(pct)} />
                        </div>
                        <span style={dailyTrendValue}>{formatUSD(day.cost_usd)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </TabShell>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const glassCard: React.CSSProperties = {
    padding: 20,
    borderRadius: 16,
    background: 'var(--glass-card-bg)',
    backdropFilter: 'var(--glass-card-blur)',
    WebkitBackdropFilter: 'var(--glass-card-blur)',
    border: '1px solid var(--glass-card-border)',
    boxShadow: 'var(--glass-card-inset)',
  };

  const labelContainer: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--text-secondary)',
    marginBottom: 12,
    fontSize: 11,
    fontWeight: 600,
  };

  const iconStyle: React.CSSProperties = {
    color: 'var(--text-secondary)',
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 38,
    fontWeight: 700,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    letterSpacing: '-0.03em',
    lineHeight: 1,
  };

  return (
    <div style={glassCard}>
      <div style={labelContainer}>
        <div style={iconStyle}>{icon}</div>
        <span>{label}</span>
      </div>
      <p style={valueStyle}>{value}</p>
    </div>
  );
}

export default React.memo(CostsTab);
