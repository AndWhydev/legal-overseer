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

