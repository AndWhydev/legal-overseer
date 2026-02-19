/**
 * AWU Deployment Configuration
 *
 * All Webbed Up — Andy Taleb's digital agency.
 * This is the primary testbed deployment for BitBit.
 */

import type { Organization, AgentType } from '@bitbit/core'

export const org: Omit<Organization, 'id' | 'created_at' | 'updated_at'> = {
  name: 'All Webbed Up',
  slug: 'awu',
  plan: 'pro',
  settings: {
    default_model_tier: 'haiku',
    confidence_thresholds: { act: 0.85, ask: 0.55 },
    notification_channels: ['whatsapp', 'email'],
    timezone: 'Australia/Brisbane',
    branding: {
      company_name: 'All Webbed Up',
      primary_color: '#1a1a2e',
      logo_url: undefined, // TODO: Upload AWU logo
    },
  },
}

/**
 * Agent rollout plan — which agents are enabled and in what order.
 */
export const agentRollout: {
  phase: number
  agents: AgentType[]
  target_week: string
}[] = [
  {
    phase: 0,
    agents: ['sentry', 'lead-swarm', 'invoice-flow'],
    target_week: 'Week 3-4',
  },
  {
    phase: 1,
    agents: ['channel-triage', 'client-comms'],
    target_week: 'Week 5-6',
  },
  {
    phase: 2,
    agents: ['proposal-bot', 'client-onboarding'],
    target_week: 'Week 7-8',
  },
  {
    phase: 3,
    agents: ['ad-script-gen', 'ai-search-optimizer', 'tender-hunter'],
    target_week: 'Week 9-12',
  },
]

/**
 * Channel credentials mapping.
 * Actual secrets stored in environment variables / 1Password.
 */
export const channels = {
  gmail: {
    description: 'Andy personal + forwarded AWU emails',
    account: 'amatorri847@gmail.com', // Tor's Gmail receives all forwarded mail
    notes: 'Cloudflare Email Routing forwards contact@torkay.com + hi@torkay.com here',
  },
  outlook: {
    description: 'AWU business email',
    account: 'tor@allwebbedup.com.au',
    notes: 'Forwarding active to Gmail. Also accessible via Outlook web.',
  },
  asana: {
    description: 'AWU project management',
    workspace: 'allwebbedup.com.au',
    project: 'ALL WEBBED UP website',
  },
  calendly: {
    description: 'AWU booking calendar',
    account: 'andy@allwebbedup.com.au',
    notes: 'FCF (Calendar Funnel) pattern. Loom walkthrough from Andy.',
  },
  whatsapp: {
    description: 'Primary comms channel for Andy',
    number: '+61 400 699 890',
    notes: 'Andy prefers WhatsApp for quick updates and approvals',
  },
  stripe: {
    description: 'Payment processing',
    notes: 'Tor Stripe account — needs identity verification to unlock payouts',
  },
}

/**
 * AWU client roster — deployment targets for agent testing.
 */
export const clients = [
  {
    name: 'White House RE',
    contact: 'Sezer Yunus',
    status: 'active',
    project_type: 'website',
    notes: 'WordPress + VaultRE. 6 changes completed, invoiced $200.',
  },
  {
    name: 'Event Hero',
    contact: 'Harun',
    status: 'scoping',
    project_type: 'marketplace',
    budget: '$10-12k MVP',
    notes: 'Scope doc stuck behind SharePoint access. Need .docx from Harun.',
  },
  {
    name: 'BEPOP',
    contact: 'Dima, Rawya',
    status: 'proposal_sent',
    project_type: 'marketplace',
    budget: '$7-15k',
    notes: '3 tiers quoted. NDA: Andy, Dima, Rawya.',
  },
  {
    name: 'SexPay',
    contact: undefined,
    status: 'quote_pending',
    project_type: 'platform',
    budget: '$7k',
    notes: 'Adult content platform. Supabase + Vercel + Bunny CDN. Need ABN.',
  },
  {
    name: 'Ozy Homes',
    contact: 'Ghazi',
    status: 'active',
    project_type: 'ads',
    notes: 'Ad materials using Ghazi branding.',
  },
  {
    name: 'Salken Engineering / Club Team Manager',
    contact: 'Marquis Abela',
    status: 'active',
    project_type: 'mobile_app',
    notes: 'Client frustrated at month 5. Demo: harry.thomas@pbfc.com / demo1234',
  },
]
