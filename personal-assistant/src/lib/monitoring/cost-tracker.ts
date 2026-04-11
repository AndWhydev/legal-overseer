/**
 * Agent Cost Tracking
 *
 * Reads agent_runs table to aggregate LLM costs by model, agent type, and time period.
 * Follows DI pattern: all functions accept SupabaseClient as first parameter.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { computeCost, type ModelPurpose } from '@/lib/agent/model-registry';

// Map legacy model_used DB values to purposes for cost calculation
const PURPOSE_MAP: Record<string, ModelPurpose> = {
  'classification': 'classification',
  'conversation': 'conversation',
  'synthesis': 'synthesis',
  // Legacy tier names stored in DB
  'haiku': 'classification',
  'sonnet': 'conversation',
  'opus': 'synthesis',
};

export interface CostEntry {
  model: string;
  agent_type: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  run_count: number;
}

export interface CostSummary {
  period: string;
  total_cost_usd: number;
  total_runs: number;
  total_input_tokens: number;
  total_output_tokens: number;
  by_model: CostEntry[];
  by_agent: CostEntry[];
  daily_trend: Array<{ date: string; cost_usd: number; runs: number }>;
}

export interface CostBudget {
  daily_limit_usd: number;
  monthly_limit_usd: number;
  alert_threshold_pct: number;
}

const DEFAULT_BUDGET: CostBudget = {
  daily_limit_usd: 10,
  monthly_limit_usd: 200,
  alert_threshold_pct: 80,
};

/**
 * Calculate cost for a given token count and model.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const purpose = PURPOSE_MAP[model] || 'conversation';
  return Math.round(computeCost(purpose, inputTokens, outputTokens) * 10000) / 10000;
}

/**
 * Fetch cost summary for a given period.
 */
export async function getCostSummary(
  supabase: SupabaseClient,
  period: 'today' | '7d' | '30d' | 'month'
): Promise<CostSummary> {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  const { data: runs, error } = await supabase
    .from('agent_runs')
    .select(
      'id, agent_config_id, model_used, tokens_in, tokens_out, created_at, agent_configs!inner(agent_type)'
    )
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch agent runs: ${error.message}`);
  }

  const entries = runs || [];

  // Aggregate by model
  const byModelMap = new Map<string, CostEntry>();
  const byAgentMap = new Map<string, CostEntry>();
  const dailyMap = new Map<string, { cost_usd: number; runs: number }>();

  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;

  for (const run of entries) {
    const model = run.model_used || 'unknown';
    const agentType = (run.agent_configs as { agent_type?: string } | null)?.agent_type || 'unknown';
    const inputTokens = run.tokens_in || 0;
    const outputTokens = run.tokens_out || 0;
    const cost = calculateCost(model, inputTokens, outputTokens);
    const dateKey = new Date(run.created_at).toISOString().slice(0, 10);

    totalCost += cost;
    totalInput += inputTokens;
    totalOutput += outputTokens;

    // By model
    const modelEntry = byModelMap.get(model) || {
      model, agent_type: '', input_tokens: 0, output_tokens: 0, cost_usd: 0, run_count: 0,
    };
    modelEntry.input_tokens += inputTokens;
    modelEntry.output_tokens += outputTokens;
    modelEntry.cost_usd += cost;
    modelEntry.run_count += 1;
    byModelMap.set(model, modelEntry);

    // By agent
    const agentEntry = byAgentMap.get(agentType) || {
      model: '', agent_type: agentType, input_tokens: 0, output_tokens: 0, cost_usd: 0, run_count: 0,
    };
    agentEntry.input_tokens += inputTokens;
    agentEntry.output_tokens += outputTokens;
    agentEntry.cost_usd += cost;
    agentEntry.run_count += 1;
    byAgentMap.set(agentType, agentEntry);

    // Daily trend
    const daily = dailyMap.get(dateKey) || { cost_usd: 0, runs: 0 };
    daily.cost_usd += cost;
    daily.runs += 1;
    dailyMap.set(dateKey, daily);
  }

  return {
    period,
    total_cost_usd: Math.round(totalCost * 100) / 100,
    total_runs: entries.length,
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    by_model: Array.from(byModelMap.values()),
    by_agent: Array.from(byAgentMap.values()),
    daily_trend: Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * Check if current spending exceeds budget thresholds.
 */
export async function checkBudgetAlerts(
  supabase: SupabaseClient,
  budget: CostBudget = DEFAULT_BUDGET
): Promise<{
  daily_exceeded: boolean;
  monthly_exceeded: boolean;
  daily_pct: number;
  monthly_pct: number;
}> {
  const [daily, monthly] = await Promise.all([
    getCostSummary(supabase, 'today'),
    getCostSummary(supabase, 'month'),
  ]);

  const dailyPct = (daily.total_cost_usd / budget.daily_limit_usd) * 100;
  const monthlyPct = (monthly.total_cost_usd / budget.monthly_limit_usd) * 100;

  return {
    daily_exceeded: dailyPct >= budget.alert_threshold_pct,
    monthly_exceeded: monthlyPct >= budget.alert_threshold_pct,
    daily_pct: Math.round(dailyPct * 10) / 10,
    monthly_pct: Math.round(monthlyPct * 10) / 10,
  };
}

/**
 * Get the top N most expensive agent types for a period.
 */
export async function getTopAgentCosts(
  supabase: SupabaseClient,
  period: 'today' | '7d' | '30d' | 'month',
  limit: number = 5
): Promise<CostEntry[]> {
  const summary = await getCostSummary(supabase, period);
  return summary.by_agent
    .sort((a, b) => b.cost_usd - a.cost_usd)
    .slice(0, limit);
}
