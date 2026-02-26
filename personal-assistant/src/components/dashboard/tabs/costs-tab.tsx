'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { DollarSign, TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react';
import { TabShell } from '@/components/ui/tab-shell';
import { TabHeader } from '@/components/ui/tab-header';

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

  return (
    <TabShell>
      <TabHeader
        icon={DollarSign}
        iconColor="var(--bb-status-warning)"
        title="Costs"
        subtitle="Monitor agent LLM spend across models and agents"
      />

      <div className="flex flex-col gap-6 p-6">
        {/* Period selector */}
        <div className="flex gap-1 rounded-lg bg-[var(--bg-elevated)] p-1">
          {(['today', '7d', '30d', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-[var(--bb-orange)] text-white'
                  : 'text-muted-foreground hover:text-[var(--text-primary)]'
              }`}
            >
              {p === 'today' ? 'Today' : p === 'month' ? 'This Month' : p}
            </button>
          ))}
        </div>

        {/* Budget Alerts */}
        {alerts && (alerts.daily_exceeded || alerts.monthly_exceeded) && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <div className="text-sm">
              {alerts.daily_exceeded && (
                <p>Daily spend at <strong>{alerts.daily_pct}%</strong> of budget</p>
              )}
              {alerts.monthly_exceeded && (
                <p>Monthly spend at <strong>{alerts.monthly_pct}%</strong> of budget</p>
              )}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-muted-foreground text-sm">Loading cost data...</div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {summary && !loading && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <SummaryCard
                icon={<DollarSign className="h-4 w-4" />}
                label="Total Cost"
                value={formatUSD(summary.total_cost_usd)}
              />
              <SummaryCard
                icon={<BarChart3 className="h-4 w-4" />}
                label="Total Runs"
                value={String(summary.total_runs)}
              />
              <SummaryCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="Input Tokens"
                value={formatTokens(summary.total_input_tokens)}
              />
              <SummaryCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="Output Tokens"
                value={formatTokens(summary.total_output_tokens)}
              />
            </div>

            {/* Cost by Model */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">Cost by Model</h2>
              <div className="space-y-2">
                {summary.by_model.map((entry) => (
                  <div key={entry.model} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs">{entry.model}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{entry.run_count} runs</span>
                      <span className="font-medium">{formatUSD(entry.cost_usd)}</span>
                    </div>
                  </div>
                ))}
                {summary.by_model.length === 0 && (
                  <p className="text-sm text-muted-foreground">No data for this period</p>
                )}
              </div>
            </div>

            {/* Cost by Agent */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">Cost by Agent</h2>
              <div className="space-y-2">
                {summary.by_agent.map((entry) => (
                  <div key={entry.agent_type} className="flex items-center justify-between text-sm">
                    <span>{entry.agent_type}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{entry.run_count} runs</span>
                      <span className="text-muted-foreground">{formatTokens(entry.input_tokens + entry.output_tokens)} tok</span>
                      <span className="font-medium">{formatUSD(entry.cost_usd)}</span>
                    </div>
                  </div>
                ))}
                {summary.by_agent.length === 0 && (
                  <p className="text-sm text-muted-foreground">No data for this period</p>
                )}
              </div>
            </div>

            {/* Daily Trend */}
            {summary.daily_trend.length > 0 && (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">Daily Trend</h2>
                <div className="space-y-1">
                  {summary.daily_trend.map((day) => {
                    const maxCost = Math.max(...summary.daily_trend.map((d) => d.cost_usd), 0.01);
                    const pct = (day.cost_usd / maxCost) * 100;
                    return (
                      <div key={day.date} className="flex items-center gap-3 text-xs">
                        <span className="w-20 text-muted-foreground">{day.date.slice(5)}</span>
                        <div className="flex-1 h-4 rounded bg-[var(--bg-base)] overflow-hidden">
                          <div
                            className="h-full rounded bg-emerald-500/60"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-16 text-right font-mono">{formatUSD(day.cost_usd)}</span>
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
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

export default React.memo(CostsTab);
