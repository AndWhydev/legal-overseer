import type { IndustryPack } from '../types'

export const contentCreatorPack: IndustryPack = {
  id: 'content-creator',
  label: 'Content Creator',
  description: 'Creator growth workflows, social-proof assets, lead capture, and monetization operations',
  icon: '🎥',

  modules: [
    'creator-studio',
    'contacts',
    'leads',
    'invoices',
    'approvals',
    'channels',
    'ad-scripts',
    'ai-search',
    'reports',
    'knowledge',
    'analytics',
    'activity',
  ],

  defaultAgents: ['lead-swarm', 'client-comms', 'ad-script-gen'],

  availableAgents: [
    'lead-swarm',
    'client-comms',
    'ad-script-gen',
    'invoice-flow',
    'ai-search-optimizer',
    'channel-triage',
  ],

  persona: {
    name: 'BitBit',
    context: 'content creator business operations',
    systemPromptSuffix:
      'You help creators package offers, generate social proof assets, handle brand leads, and keep revenue workflows organized.',
  },

  labelOverrides: {
    leads: 'Brand Leads',
    invoices: 'Payouts',
    contacts: 'Partners',
  },

  tierModules: {
    starter: ['creator-studio', 'contacts', 'approvals'],
    growth: ['creator-studio', 'contacts', 'leads', 'invoices', 'approvals', 'channels', 'ad-scripts'],
    scale: 'all',
    enterprise: 'all',
  },

  kpis: [
    {
      key: 'brand-leads',
      label: 'Brand Leads',
      dataKey: 'activeContacts',
      fallback: 7,
      chart: 'sparkline',
      color: 'var(--bb-pink)',
      trend: 'up',
      trendValue: '+3 this week',
      subtitle: 'Inbound enquiries',
      chartData: [2, 3, 4, 3, 5, 6, 7],
    },
    {
      key: 'payouts',
      label: 'Payouts Due',
      dataKey: 'totalRevenue',
      fallback: '2,800',
      unit: '$',
      chart: 'bar',
      color: 'var(--bb-green)',
      trend: 'up',
      trendValue: '+$1.2k this month',
      subtitle: 'Pending invoices',
      chartData: [800, 1200, 400, 600],
      chartLabels: ['Paid', 'Sent', 'Draft', 'Late'],
      chartColors: ['var(--bb-green)', 'var(--bb-cyan)', 'var(--bb-amber)', 'var(--bb-red)'],
    },
    {
      key: 'handled',
      label: 'Handled Today',
      dataKey: 'actionsToday',
      fallback: 18,
      chart: 'bar',
      color: 'var(--bb-orange)',
      trend: 'up',
      trendValue: '+5 vs yesterday',
      subtitle: 'DMs, emails, follow-ups',
      chartData: [2, 4, 3, 6, 2, 1],
    },
    {
      key: 'connections',
      label: 'Connections Live',
      fallback: 4,
      chart: 'bar',
      color: 'var(--bb-purple)',
      trend: 'flat',
      trendValue: 'All synced',
      subtitle: 'Service health',
      chartData: [1, 1, 1, 1],
      chartLabels: ['Email', 'Insta', 'Cal', 'Stripe'],
      chartColors: ['var(--bb-cyan)', 'var(--bb-pink)', 'var(--bb-green)', 'var(--bb-purple)'],
    },
  ],

  compositions: {
    essential: {
      primaryModules: ['dashboard', 'creator-studio', 'inbox', 'approvals'],
      advancedModules: ['chat', 'leads', 'invoices', 'ad-scripts'],
    },
    full: {
      primaryModules: [
        'dashboard',
        'creator-studio',
        'chat',
        'inbox',
        'leads',
        'invoices',
        'contacts',
        'approvals',
      ],
      advancedModules: ['channels', 'ad-scripts', 'ai-search', 'analytics', 'reports', 'knowledge', 'activity'],
    },
  },

  commandCenter: {
    widgets: ['kpi-summary', 'pending-approvals', 'hot-leads', 'revenue-week', 'channel-activity'],
    quickActions: ['approve-next', 'open-inbox', 'new-invoice'],
  },
}

