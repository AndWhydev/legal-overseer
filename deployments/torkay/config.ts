/**
 * Torkay Deployment Configuration
 *
 * Tor's personal agency — dogfooding instance.
 * This mirrors the current ~/Agent/.agent/ system as a BitBit deployment.
 */

import type { Organization } from '@bitbit/core'

export const org: Omit<Organization, 'id' | 'created_at' | 'updated_at'> = {
  name: 'Torkay',
  slug: 'torkay',
  plan: 'pro',
  settings: {
    default_model_tier: 'sonnet',
    confidence_thresholds: { act: 0.80, ask: 0.50 },
    notification_channels: ['imessage', 'email'],
    timezone: 'Australia/Brisbane',
    branding: {
      company_name: 'Torkay',
      primary_color: '#000000',
    },
  },
}

/**
 * Torkay channels — maps to existing .agent/ infrastructure.
 */
export const channels = {
  gmail: {
    account: 'amatorri847@gmail.com',
    send_as: ['contact@torkay.com', 'hi@torkay.com'],
    notes: 'SMTP2GO for outbound. Cloudflare Email Routing for inbound.',
  },
  imessage: {
    notes: 'macOS chat.db adapter. Read-only in production.',
  },
  asana: {
    workspace: 'allwebbedup.com.au',
    notes: 'Shared workspace with AWU. Filter by project for Torkay tasks.',
  },
  calendar: {
    notes: 'Apple Calendar via osascript.',
  },
  reminders: {
    notes: 'Apple Reminders via osascript.',
  },
}

/**
 * Torkay clients — Tor's direct clients (not via AWU).
 */
export const clients = [
  {
    name: 'Steve West / Presale Services',
    status: 'active',
    notes: 'SEO, content, LinkedIn articles. $1000 paid to date. Multi-service pages in progress.',
  },
  {
    name: 'Maya Mendoza',
    status: 'awaiting_credentials',
    notes: '$500 website rebuild accepted. Awaiting Hostinger login.',
  },
  {
    name: 'Ranal Charan / 64 Property',
    status: 'follow_up_march',
    notes: 'Steve intro. Requested 30-day delay. Follow up mid-March.',
  },
  {
    name: 'Pressure Wash & Co',
    status: 'awaiting_reply',
    notes: 'Steve intro. Email sent Feb 4, no response.',
  },
]
