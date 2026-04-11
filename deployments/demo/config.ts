/**
 * Demo Deployment Configuration
 *
 * Showcase instance with mock data for demos, investor pitches,
 * and onboarding walkthroughs.
 */

import type { Organization } from '@bitbit/core'

export const org: Omit<Organization, 'id' | 'created_at' | 'updated_at'> = {
  name: 'BitBit Demo',
  slug: 'demo',
  plan: 'pro',
  settings: {
    default_model_tier: 'haiku',
    confidence_thresholds: { act: 0.80, ask: 0.50 },
    notification_channels: ['email'],
    timezone: 'Australia/Brisbane',
    branding: {
      company_name: 'BitBit',
      primary_color: '#6366f1',
    },
  },
}
