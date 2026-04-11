import type { IndustryPack } from '../types'

export const tradiePack: IndustryPack = {
  id: 'tradie',
  label: 'Trade Business',
  description: 'Job scheduling, quoting, invoicing, and customer comms for tradies',
  icon: '🔧',

  modules: [
    'contacts', 'leads', 'invoices', 'jobs', 'quotes',
    'approvals', 'channels', 'costs', 'reports', 'knowledge', 'activity',
  ],

  defaultAgents: ['channel-triage', 'quote-bot', 'invoice-flow', 'job-reminder'],

  availableAgents: [
    'channel-triage', 'quote-bot', 'invoice-flow', 'job-reminder',
    'lead-swarm', 'client-comms',
  ],

  persona: {
    name: 'BitBit',
    context: 'trade business operations',
    systemPromptSuffix: 'You help manage customer enquiries, quotes, job scheduling, and invoice collection for a trade business.',
  },

  labelOverrides: {
    contacts: 'Customers',
    leads: 'Enquiries',
    costs: 'Materials',
    knowledge: 'Compliance',
  },

  tierModules: {
    starter:    ['contacts', 'invoices', 'approvals'],
    growth:     ['contacts', 'leads', 'invoices', 'jobs', 'quotes', 'approvals', 'channels', 'costs'],
    scale:      'all',
    enterprise: 'all',
  },

  compositions: {
    essential: {
      primaryModules: ['dashboard', 'inbox', 'jobs', 'invoices'],
      advancedModules: ['chat', 'leads', 'quotes', 'channels'],
    },
    full: {
      primaryModules: ['dashboard', 'chat', 'inbox', 'jobs', 'quotes', 'invoices', 'leads', 'contacts'],
      advancedModules: ['channels', 'costs', 'approvals', 'reports', 'knowledge', 'activity'],
    },
  },

  kpis: [
    {
      key: 'jobs-today',
      label: 'Jobs Today',
      dataKey: 'activeTasks',
      fallback: 3,
      chart: 'bar',
      color: 'var(--bb-orange)',
      trend: 'flat',
      trendValue: '2 scheduled, 1 on site',
      subtitle: 'Active job cards',
      chartData: [1, 2, 3, 2, 4, 3, 3],
      chartLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    },
    {
      key: 'quotes-out',
      label: 'Quotes Out',
      dataKey: 'totalRevenue',
      fallback: '8,200',
      unit: '$',
      chart: 'sparkline',
      color: 'var(--bb-cyan)',
      trend: 'up',
      trendValue: '+$2.4k this week',
      subtitle: 'Outstanding quote value',
      chartData: [3200, 4100, 5800, 6200, 7000, 7800, 8200],
    },
    {
      key: 'response',
      label: 'Enquiry Response',
      fallback: '1.8',
      unit: 'min',
      chart: 'sparkline',
      color: 'var(--bb-green)',
      trend: 'down',
      trendValue: '0.5 min faster',
      subtitle: 'Avg reply to new enquiries',
      chartData: [4.1, 3.5, 2.8, 2.4, 2.0, 1.9, 1.8],
    },
    {
      key: 'connections',
      label: 'Connections Live',
      fallback: 3,
      chart: 'bar',
      color: 'var(--bb-purple)',
      trend: 'flat',
      trendValue: 'All synced',
      subtitle: 'Service health',
      chartData: [1, 1, 1],
      chartLabels: ['WhApp', 'Cal', 'Xero'],
      chartColors: ['var(--bb-green)', 'var(--bb-cyan)', 'var(--bb-orange)'],
    },
  ],

  kanbanDefaults: [
    { title: 'Backlog', color: '#64748b' },
    { title: 'Scheduled', color: '#3B82F6' },
    { title: 'On Site', color: '#F59E0B' },
    { title: 'Complete', color: '#22C55E' },
  ],

  commandCenter: {
    widgets: ['todays-jobs', 'outstanding-quotes', 'unread-messages', 'revenue-week', 'agent-activity'],
    quickActions: ['open-inbox', 'new-quote', 'approve-next', 'new-invoice'],
  },

  planLimits: {
    starter: { maxUsers: 1, maxChannels: 2, tokenBudget: 40_000 },
  },
}
