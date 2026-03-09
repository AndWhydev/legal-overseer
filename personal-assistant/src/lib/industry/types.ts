import type { UIComposition } from '@/lib/modules/registry'

/** KPI card configuration for the command center dashboard. */
export interface KPIConfig {
  /** Unique key used to resolve the data source at render time. */
  key: string
  /** Display label shown to the right of the value. */
  label: string
  /** Data field from dashboard stats to display, or null for derived/mock values. */
  dataKey?: 'activeTasks' | 'totalRevenue' | 'agentRunsToday' | 'actionsToday' | 'activeContacts'
  /** Static fallback value when live data is unavailable. */
  fallback: string | number
  /** Optional unit displayed before the value (e.g. "$", "%", "min"). */
  unit?: string
  /** Chart type to render below the value. */
  chart: 'sparkline' | 'bar'
  /** CSS color variable for the chart and accents. */
  color: string
  /** Trend direction indicator. */
  trend: 'up' | 'down' | 'flat'
  /** Trend description text (e.g. "+12% this week"). */
  trendValue: string
  /** Small context text below the chart. */
  subtitle: string
  /** Mock chart data points for initial display before live data. */
  chartData: number[]
  /** Optional bar chart labels (for chart: 'bar' with showLabels). */
  chartLabels?: string[]
  /** Optional per-bar colors (for chart: 'bar'). */
  chartColors?: string[]
}

export interface IndustryPack {
  id: string
  label: string
  description: string
  icon: string

  modules: string[]
  defaultAgents: string[]
  availableAgents: string[]

  persona: {
    name: string
    context: string
    systemPromptSuffix: string
  }

  labelOverrides: Record<string, string>

  tierModules: Record<string, string[] | 'all'>

  compositions: {
    essential: Partial<UIComposition>
    full: Partial<UIComposition>
  }

  kanbanDefaults?: Array<{ title: string; color: string }>

  commandCenter?: {
    widgets: string[]
    quickActions: string[]
  }

  /** KPI cards shown at the top of the command center. Max 4. */
  kpis?: KPIConfig[]

  planLimits?: Record<string, {
    maxUsers: number
    maxChannels: number
    tokenBudget: number
  }>
}
