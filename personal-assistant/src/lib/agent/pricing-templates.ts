/**
 * Pricing Template System
 *
 * Service component library with base prices and tier multipliers.
 * Used by proposal-bot to auto-calculate pricing from brief input.
 */

export interface ServiceComponent {
  id: string
  name: string
  category: string
  basePrice: number
  unit: 'fixed' | 'monthly' | 'per_page'
  description: string
}

export interface PricingTier {
  name: 'basic' | 'standard' | 'premium'
  label: string
  multiplier: number
  includes: string[]
}

export interface PricingResult {
  tier: string
  components: Array<{ name: string; price: number; unit: string }>
  subtotal: number
  total: number
}

// ---------------------------------------------------------------------------
// Service Component Library
// ---------------------------------------------------------------------------

export const SERVICE_COMPONENTS: ServiceComponent[] = [
  // Web Development
  { id: 'website-build', name: 'Website Build', category: 'web-development', basePrice: 3500, unit: 'fixed', description: 'Custom website design and development' },
  { id: 'landing-page', name: 'Landing Page', category: 'web-development', basePrice: 1200, unit: 'fixed', description: 'Single conversion-focused landing page' },
  { id: 'additional-page', name: 'Additional Page', category: 'web-development', basePrice: 400, unit: 'per_page', description: 'Extra page beyond base package' },
  { id: 'ecommerce', name: 'E-commerce Setup', category: 'web-development', basePrice: 5000, unit: 'fixed', description: 'Online store with payments and inventory' },
  { id: 'web-app', name: 'Web Application', category: 'web-development', basePrice: 8000, unit: 'fixed', description: 'Custom web application' },
  { id: 'marketplace', name: 'Marketplace Platform', category: 'web-development', basePrice: 12000, unit: 'fixed', description: 'Multi-vendor marketplace' },
  { id: 'mobile-app', name: 'Mobile App', category: 'web-development', basePrice: 8000, unit: 'fixed', description: 'Cross-platform mobile application' },

  // SEO
  { id: 'seo-setup', name: 'SEO Setup', category: 'seo', basePrice: 2000, unit: 'fixed', description: 'Initial SEO audit, on-page optimization, and schema markup' },
  { id: 'seo-monthly', name: 'SEO Monthly', category: 'seo', basePrice: 1500, unit: 'monthly', description: 'Ongoing SEO, content optimization, and reporting' },
  { id: 'local-seo', name: 'Local SEO', category: 'seo', basePrice: 800, unit: 'fixed', description: 'Google Business Profile, local citations, and maps optimization' },

  // Content
  { id: 'content-strategy', name: 'Content Strategy', category: 'content', basePrice: 1500, unit: 'fixed', description: 'Content calendar, topic research, and editorial plan' },
  { id: 'copywriting', name: 'Copywriting Package', category: 'content', basePrice: 1200, unit: 'fixed', description: 'Website copy for up to 8 pages' },
  { id: 'blog-package', name: 'Blog Package (4 posts)', category: 'content', basePrice: 800, unit: 'monthly', description: 'Monthly blog content creation' },

  // Ads / Marketing
  { id: 'google-ads-setup', name: 'Google Ads Setup', category: 'ads', basePrice: 1500, unit: 'fixed', description: 'Campaign structure, keyword research, ad creation' },
  { id: 'google-ads-mgmt', name: 'Google Ads Management', category: 'ads', basePrice: 1000, unit: 'monthly', description: 'Ongoing campaign optimization and reporting' },
  { id: 'meta-ads-setup', name: 'Meta Ads Setup', category: 'ads', basePrice: 1200, unit: 'fixed', description: 'Facebook/Instagram campaign creation' },
  { id: 'meta-ads-mgmt', name: 'Meta Ads Management', category: 'ads', basePrice: 800, unit: 'monthly', description: 'Ongoing social ads optimization' },

  // Branding
  { id: 'brand-identity', name: 'Brand Identity', category: 'branding', basePrice: 2500, unit: 'fixed', description: 'Logo, color palette, typography, and brand guidelines' },
  { id: 'brand-refresh', name: 'Brand Refresh', category: 'branding', basePrice: 1500, unit: 'fixed', description: 'Updated logo and guidelines from existing brand' },

  // Automation
  { id: 'crm-setup', name: 'CRM Setup', category: 'automation', basePrice: 2000, unit: 'fixed', description: 'CRM configuration, data import, and workflow setup' },
  { id: 'workflow-automation', name: 'Workflow Automation', category: 'automation', basePrice: 1500, unit: 'fixed', description: 'Business process automation with integrations' },
  { id: 'analytics-setup', name: 'Analytics Setup', category: 'analytics', basePrice: 800, unit: 'fixed', description: 'GA4, GTM, and conversion tracking' },
]

// ---------------------------------------------------------------------------
// Tier Definitions
// ---------------------------------------------------------------------------

export const DEFAULT_TIERS: PricingTier[] = [
  {
    name: 'basic',
    label: 'Basic',
    multiplier: 1.0,
    includes: ['Core deliverables', 'Basic revisions (2 rounds)', '30-day support'],
  },
  {
    name: 'standard',
    label: 'Standard',
    multiplier: 1.5,
    includes: [
      'Core deliverables',
      'Extended revisions (5 rounds)',
      '60-day support',
      'SEO optimization',
      'Analytics setup',
    ],
  },
  {
    name: 'premium',
    label: 'Premium',
    multiplier: 2.2,
    includes: [
      'Core deliverables',
      'Unlimited revisions',
      '90-day support',
      'SEO optimization',
      'Analytics setup',
      'Content strategy',
      'Monthly reporting',
    ],
  },
]

// ---------------------------------------------------------------------------
// Pricing Calculator
// ---------------------------------------------------------------------------

export function findComponentsByIds(ids: string[]): ServiceComponent[] {
  return ids
    .map((id) => SERVICE_COMPONENTS.find((c) => c.id === id))
    .filter((c): c is ServiceComponent => c !== undefined)
}

export function findComponentsByCategory(category: string): ServiceComponent[] {
  return SERVICE_COMPONENTS.filter((c) => c.category === category)
}

export function matchComponentsFromText(text: string): ServiceComponent[] {
  const normalized = text.toLowerCase()
  const matched = new Set<string>()

  const keywords: Record<string, string[]> = {
    'website-build': ['website', 'web site', 'new site'],
    'landing-page': ['landing page', 'lp'],
    'ecommerce': ['ecommerce', 'e-commerce', 'online store', 'shop'],
    'web-app': ['web app', 'web application', 'saas', 'platform'],
    'marketplace': ['marketplace', 'multi-vendor'],
    'mobile-app': ['mobile app', 'ios', 'android', 'react native'],
    'seo-setup': ['seo'],
    'seo-monthly': ['ongoing seo', 'monthly seo', 'seo retainer'],
    'local-seo': ['local seo', 'google business', 'gmb'],
    'content-strategy': ['content strategy', 'content plan'],
    'copywriting': ['copywriting', 'copy', 'website copy'],
    'blog-package': ['blog', 'articles'],
    'google-ads-setup': ['google ads', 'adwords', 'ppc'],
    'meta-ads-setup': ['facebook ads', 'instagram ads', 'meta ads', 'social ads'],
    'brand-identity': ['branding', 'brand identity', 'logo design'],
    'brand-refresh': ['brand refresh', 'rebrand'],
    'crm-setup': ['crm'],
    'workflow-automation': ['automation', 'workflow', 'zapier'],
    'analytics-setup': ['analytics', 'tracking', 'ga4', 'gtm'],
  }

  for (const [componentId, terms] of Object.entries(keywords)) {
    if (terms.some((term) => normalized.includes(term))) {
      matched.add(componentId)
    }
  }

  return findComponentsByIds(Array.from(matched))
}

export function calculateTierPricing(
  components: ServiceComponent[],
  tier: PricingTier,
  quantities?: Record<string, number>,
): PricingResult {
  const priced = components.map((c) => {
    const qty = quantities?.[c.id] ?? 1
    const price = Math.round(c.basePrice * tier.multiplier * qty)
    return { name: c.name, price, unit: c.unit }
  })

  const subtotal = priced.reduce((sum, c) => sum + c.price, 0)

  return {
    tier: tier.label,
    components: priced,
    subtotal,
    total: subtotal,
  }
}

export function calculateAllTiers(
  components: ServiceComponent[],
  quantities?: Record<string, number>,
): PricingResult[] {
  return DEFAULT_TIERS.map((tier) => calculateTierPricing(components, tier, quantities))
}

/**
 * Calculate pricing from a budget override. Distributes to tiers using multipliers.
 */
export function calculateFromBudget(
  budget: number,
  projectType: string,
): Array<{ tier: string; price: number; includes: string[] }> {
  return DEFAULT_TIERS.map((t) => ({
    tier: t.label,
    price: Math.round(budget * t.multiplier),
    includes: t.includes,
  }))
}
