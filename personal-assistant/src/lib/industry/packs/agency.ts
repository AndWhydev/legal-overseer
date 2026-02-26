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
