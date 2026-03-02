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
