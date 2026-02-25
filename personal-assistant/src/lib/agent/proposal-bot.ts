import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProposalBrief {
  clientSlug: string
  projectType: string
  requirements: string
  budget?: number
  notes?: string
}

export interface PricingTier {
  name: 'basic' | 'standard' | 'premium'
  label: string
  multiplier: number
  includes: string[]
}

export interface GeneratedProposal {
  title: string
  clientName: string
  projectType: string
  scope: string
  tiers: { tier: string; price: number; includes: string[] }[]
  timeline: string
  terms: string
}

const DEFAULT_TIERS: PricingTier[] = [
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
    includes: ['Core deliverables', 'Extended revisions (5 rounds)', '60-day support', 'SEO optimization', 'Analytics setup'],
  },
  {
    name: 'premium',
    label: 'Premium',
    multiplier: 2.2,
    includes: ['Core deliverables', 'Unlimited revisions', '90-day support', 'SEO optimization', 'Analytics setup', 'Content strategy', 'Monthly reporting'],
  },
]

const BASE_RATES: Record<string, number> = {
  website: 3500,
  mobile_app: 8000,
  marketplace: 12000,
  ads: 1500,
  seo: 2000,
  platform: 15000,
  branding: 2500,
  default: 3000,
}

function calculatePrice(projectType: string, tier: PricingTier, budget?: number): number {
  const base = budget || BASE_RATES[projectType] || BASE_RATES.default
  return Math.round(base * tier.multiplier)
}

export async function generateProposal(
  supabase: SupabaseClient,
  orgId: string,
  brief: ProposalBrief
): Promise<GeneratedProposal> {
  // Resolve client
  const { data: contact } = await supabase
    .from('contacts')
    .select('name, profile_data')
    .eq('org_id', orgId)
    .eq('slug', brief.clientSlug)
    .single()

  const clientName = contact?.name || brief.clientSlug

  const tiers = DEFAULT_TIERS.map((t) => ({
    tier: t.label,
    price: calculatePrice(brief.projectType, t, brief.budget),
    includes: t.includes,
  }))

  const proposal: GeneratedProposal = {
    title: `${brief.projectType.replace(/_/g, ' ')} Proposal for ${clientName}`,
    clientName,
    projectType: brief.projectType,
    scope: brief.requirements,
    tiers,
    timeline: estimateTimeline(brief.projectType),
    terms: 'Payment: 50% upfront, 50% on completion. Valid for 30 days.',
  }

  // Save to proposals table
  await supabase.from('proposals').insert({
    org_id: orgId,
    client_contact_id: contact?.name ? undefined : null,
    title: proposal.title,
    project_type: brief.projectType,
    scope: brief.requirements,
    pricing: JSON.stringify(tiers),
    timeline: proposal.timeline,
    terms: proposal.terms,
    status: 'draft',
    metadata: { notes: brief.notes },
  })

  return proposal
}

export async function updateProposalStatus(
  supabase: SupabaseClient,
  orgId: string,
  proposalId: string,
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined'
): Promise<void> {
  await supabase
    .from('proposals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('org_id', orgId)
}

export async function listProposals(
  supabase: SupabaseClient,
  orgId: string,
  status?: string
) {
  let query = supabase
    .from('proposals')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

function estimateTimeline(projectType: string): string {
  const timelines: Record<string, string> = {
    website: '4-6 weeks',
    mobile_app: '8-12 weeks',
    marketplace: '12-16 weeks',
    ads: '1-2 weeks',
    seo: '3-6 months (ongoing)',
    platform: '16-24 weeks',
    branding: '2-4 weeks',
  }
  return timelines[projectType] || '4-8 weeks'
}

export const proposalBot = {
  generate: generateProposal,
  updateStatus: updateProposalStatus,
  list: listProposals,
}
