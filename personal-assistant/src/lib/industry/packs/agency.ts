import type { IndustryPack } from '../types'

export const agencyPack: IndustryPack = {
  id: 'agency',
  label: 'Digital Agency',
  description: 'Client management, proposals, invoicing, tenders, and AI-powered ad production',
  icon: '🏢',

  modules: [
    'contacts', 'leads', 'invoices', 'tenders', 'approvals', 'channels',
    'ad-scripts', 'ai-search', 'reports', 'knowledge', 'costs',
    'analytics', 'activity', 'admin', 'sentry',
  ],

  defaultAgents: ['channel-triage', 'client-comms', 'proposal-bot', 'lead-swarm'],

  availableAgents: [
    'lead-swarm', 'invoice-flow', 'sentry', 'channel-triage',
    'client-comms', 'proposal-bot', 'client-onboarding',
    'ad-script-gen', 'ai-search-optimizer', 'tender-hunter',
  ],

  persona: {
    name: 'BitBit',
    context: 'digital agency operations',
    systemPromptSuffix: 'You help manage client relationships, proposals, invoices, and digital marketing campaigns.',
  },

  labelOverrides: {},

  tierModules: {
    starter:    ['contacts', 'approvals'],
    growth:     ['contacts', 'leads', 'invoices', 'tenders', 'approvals', 'channels', 'ad-scripts', 'ai-search'],
    scale:      'all',
    enterprise: 'all',
  },

  kpis: [
    {
      key: 'handled',
      label: 'Handled Today',
      dataKey: 'actionsToday',
      fallback: 24,
      chart: 'bar',
      color: 'var(--bb-orange)',
      trend: 'up',
      trendValue: '+8 vs yesterday',
      subtitle: 'Emails, invoices, follow-ups',
      chartData: [1, 3, 5, 4, 7, 3, 1],
    },
    {
      key: 'response',
      label: 'Avg Response',
      fallback: '1.4',
      unit: 'min',
      chart: 'sparkline',
      color: 'var(--bb-green)',
      trend: 'down',
      trendValue: '0.3 min faster',
      subtitle: 'Lead acknowledgment time',
      chartData: [3.2, 2.8, 2.1, 1.9, 1.6, 1.5, 1.4],
    },
    {
      key: 'pipeline',
      label: 'Pipeline',
      dataKey: 'totalRevenue',
      fallback: '4,500',
      unit: '$',
      chart: 'sparkline',
      color: 'var(--bb-cyan)',
      trend: 'up',
      trendValue: '+2 leads this week',
      subtitle: 'Active deal value',
      chartData: [1800, 2400, 2900, 3200, 3800, 4100, 4500],
    },
    {
      key: 'connections',
      label: 'Connections Live',
      fallback: 5,
      chart: 'bar',
      color: 'var(--bb-purple)',
      trend: 'flat',
      trendValue: 'All synced',
      subtitle: 'Service health',
      chartData: [1, 1, 1, 1, 1],
      chartLabels: ['Email', 'Cal', 'WhApp', 'Slack', 'Xero'],
      chartColors: ['var(--bb-cyan)', 'var(--bb-green)', 'var(--bb-green)', 'var(--bb-purple)', 'var(--bb-orange)'],
    },
  ],

  compositions: {
    essential: {
      primaryModules: ['command-center', 'inbox', 'approvals', 'contacts'],
      advancedModules: ['chat', 'leads', 'invoices', 'channels'],
    },
    full: {
      primaryModules: [
        'command-center', 'dashboard', 'chat', 'inbox', 'leads',
        'invoices', 'tenders', 'contacts', 'approvals',
      ],
      advancedModules: ['channels', 'ad-scripts', 'ai-search', 'sentry', 'costs', 'activity', 'admin'],
    },
  },
}
