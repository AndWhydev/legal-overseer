'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { IconCurrencyDollar, IconTrendingUp, IconAlertTriangle, IconChartBar } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription as EmptyDesc } from '@/components/ui/empty';

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
    <div className="flex flex-col gap-6 p-6">
      {/* Period selector */}
      <div className="flex gap-2">
        {(['today', '7d', '30d', 'month'] as Period[]).map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p === 'today' ? 'Today' : p === 'month' ? 'This Month' : p}
          </Button>
        ))}
      </div>

      {/* Budget Alerts */}
      {alerts && (alerts.daily_exceeded || alerts.monthly_exceeded) && (
        <Alert>
          <IconAlertTriangle className="size-4" />
          <AlertTitle>Budget Warning</AlertTitle>
          <AlertDescription>
            {alerts.daily_exceeded && <p>Daily spend at <strong>{alerts.daily_pct}%</strong> of budget</p>}
            {alerts.monthly_exceeded && <p>Monthly spend at <strong>{alerts.monthly_pct}%</strong> of budget</p>}
          </AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-3 pt-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!summary && !loading && !error && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><IconCurrencyDollar /></EmptyMedia>
            <EmptyTitle>No cost data available</EmptyTitle>
            <EmptyDesc>Cost tracking will appear here once you start using AI agents and models.</EmptyDesc>
          </EmptyHeader>
        </Empty>
      )}

      {summary && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard icon={<IconCurrencyDollar className="size-4" />} label="Total Cost" value={formatUSD(summary.total_cost_usd)} />
            <SummaryCard icon={<IconChartBar className="size-4" />} label="Total Runs" value={String(summary.total_runs)} />
            <SummaryCard icon={<IconTrendingUp className="size-4" />} label="Input Tokens" value={formatTokens(summary.total_input_tokens)} />
            <SummaryCard icon={<IconTrendingUp className="size-4" />} label="Output Tokens" value={formatTokens(summary.total_output_tokens)} />
          </div>

          {/* Cost by Agent */}
          <Card>
            <CardHeader>
              <CardTitle>Cost by Agent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {summary.by_agent.map((entry) => (
                  <div key={entry.agent_type} className="flex items-center justify-between rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50">
                    <span className="text-sm">{entry.agent_type}</span>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-muted-foreground">{entry.run_count} runs</span>
                      <span className="text-muted-foreground">{formatTokens(entry.input_tokens + entry.output_tokens)} tok</span>
                      <span className="font-mono font-medium">{formatUSD(entry.cost_usd)}</span>
                    </div>
                  </div>
                ))}
                {summary.by_agent.length === 0 && (
                  <p className="py-3 text-sm text-muted-foreground">No data for this period</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Daily Trend */}
          {summary.daily_trend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Daily Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {summary.daily_trend.map((day) => {
                    const maxCost = Math.max(...summary.daily_trend.map((d) => d.cost_usd), 0.01);
                    const pct = (day.cost_usd / maxCost) * 100;
                    return (
                      <div key={day.date} className="flex items-center gap-4 text-sm">
                        <span className="w-20 shrink-0 text-muted-foreground">{day.date.slice(5)}</span>
                        <div className="flex-1">
                          <Progress value={pct} className="h-2" />
                        </div>
                        <span className="w-16 shrink-0 text-right font-mono font-medium">{formatUSD(day.cost_usd)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <p className="font-mono text-lg font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}

export default React.memo(CostsTab);
