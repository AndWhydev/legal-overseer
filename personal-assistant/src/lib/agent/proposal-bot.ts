import type { SupabaseClient } from '@supabase/supabase-js'
import { createApproval } from './approval-queue'
import { resolveEntityRanked } from '@/lib/context/entity-resolver'
import {
  matchComponentsFromText,
  calculateAllTiers,
  calculateFromBudget,
  DEFAULT_TIERS,
  type ServiceComponent,
  type PricingResult,
} from './pricing-templates'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposalBrief {
  clientSlug: string
  projectType: string
  requirements: string
  budget?: number
  notes?: string
  componentIds?: string[]
}

export interface PricingTier {
  name: 'basic' | 'standard' | 'premium'
  label: string
  multiplier: number
  includes: string[]
}

export interface ScopeDocument {
  title: string
  clientName: string
  projectType: string
  requirements: string[]
  deliverables: string[]
  assumptions: string[]
  exclusions: string[]
  timeline: string
}

export interface GeneratedProposal {
  title: string
  clientName: string
  projectType: string
  scope: string
  tiers: Array<{ tier: string; price: number; includes: string[] }>
  timeline: string
  terms: string
}

export type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined'

export interface ProposalRow {
  id: string
  org_id: string
  client_contact_id: string | null
  title: string
  project_type: string
  scope: string
  pricing: string
  timeline: string
  terms: string
  status: ProposalStatus
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  sent_at: string | null
  viewed_at: string | null
  accepted_at: string | null
}

export interface ProposalBotTickResult {
  processed: number
  followUpsSent: number
  failed: number
}

// ---------------------------------------------------------------------------
// Timeline estimation
// ---------------------------------------------------------------------------

const TIMELINES: Record<string, string> = {
  website: '4-6 weeks',
  mobile_app: '8-12 weeks',
  marketplace: '12-16 weeks',
  ads: '1-2 weeks',
  seo: '3-6 months (ongoing)',
  platform: '16-24 weeks',
  branding: '2-4 weeks',
  ecommerce: '6-8 weeks',
  'web-app': '8-12 weeks',
}

function estimateTimeline(projectType: string): string {
  return TIMELINES[projectType] || '4-8 weeks'
}

// ---------------------------------------------------------------------------
// Scope Document Generation
// ---------------------------------------------------------------------------

function extractRequirements(text: string): string[] {
  const lines = text.split(/[\n\r]+/).map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
  if (lines.length > 1) return lines

  // Split on sentence boundaries for single-block text
  return text
    .split(/\.\s+/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter((s) => s.length > 10)
}

function deriveDeliverables(projectType: string, components: ServiceComponent[]): string[] {
  const base: string[] = []

  if (components.length > 0) {
    base.push(...components.map((c) => c.description))
  } else {
    // Fallback based on project type
    const defaults: Record<string, string[]> = {
      website: ['Custom responsive website', 'Mobile-optimized design', 'Contact form integration', 'CMS setup'],
      mobile_app: ['Cross-platform mobile application', 'User authentication', 'Push notifications', 'App store submission'],
      marketplace: ['Multi-vendor platform', 'Payment processing', 'Vendor dashboard', 'Buyer/seller messaging'],
      ads: ['Campaign setup and structure', 'Ad copywriting', 'Conversion tracking', 'Performance report'],
      seo: ['SEO audit report', 'On-page optimization', 'Schema markup', 'Monthly ranking report'],
      branding: ['Logo design (3 concepts)', 'Color palette', 'Typography system', 'Brand guidelines PDF'],
    }
    base.push(...(defaults[projectType] || ['Project deliverables as scoped']))
  }

  return base
}

export async function generateScopeDocument(
  supabase: SupabaseClient,
  orgId: string,
  brief: ProposalBrief,
): Promise<ScopeDocument> {
  // Resolve client name
  const { data: contact } = await supabase
    .from('contacts')
    .select('name')
    .eq('org_id', orgId)
    .eq('slug', brief.clientSlug)
    .single()

  const clientName = contact?.name || brief.clientSlug
  const components = matchComponentsFromText(brief.requirements)
  const requirements = extractRequirements(brief.requirements)
  const deliverables = deriveDeliverables(brief.projectType, components)

  return {
    title: `${brief.projectType.replace(/_/g, ' ')} Scope for ${clientName}`,
    clientName,
    projectType: brief.projectType,
    requirements,
    deliverables,
    assumptions: [
      'Client provides all content (text, images) within 2 weeks of project start',
      'Feedback provided within 3 business days per review round',
      'Hosting and domain managed by client (or arranged separately)',
    ],
    exclusions: [
      'Third-party software licenses or subscriptions',
      'Ongoing maintenance beyond support period',
      'Stock photography or custom illustration',
    ],
    timeline: estimateTimeline(brief.projectType),
  }
}

// ---------------------------------------------------------------------------
// Pricing Generation
// ---------------------------------------------------------------------------

export async function generatePricing(
  supabase: SupabaseClient,
  orgId: string,
  scope: ScopeDocument,
  budget?: number,
): Promise<Array<{ tier: string; price: number; includes: string[] }>> {
  if (budget && budget > 0) {
    return calculateFromBudget(budget, scope.projectType)
  }

  const components = matchComponentsFromText(scope.requirements.join(' ') + ' ' + scope.deliverables.join(' '))

  if (components.length > 0) {
    const tiers = calculateAllTiers(components)
    return tiers.map((t) => ({
      tier: t.tier,
      price: t.total,
      includes: DEFAULT_TIERS.find((dt) => dt.label === t.tier)?.includes ?? [],
    }))
  }

  // Fallback to project-type base rates
  const BASE_RATES: Record<string, number> = {
    website: 3500, mobile_app: 8000, marketplace: 12000, ads: 1500,
    seo: 2000, platform: 15000, branding: 2500, ecommerce: 5000,
  }
  const base = BASE_RATES[scope.projectType] || 3000
  return calculateFromBudget(base, scope.projectType)
}

// ---------------------------------------------------------------------------
// Proposal PDF (HTML email) Generation
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export interface ProposalPdfResult {
  subject: string
  html: string
}

export async function generateProposalPdf(
  supabase: SupabaseClient,
  orgId: string,
  proposalId: string,
): Promise<ProposalPdfResult> {
  const { data: proposal, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('id', proposalId)
    .eq('org_id', orgId)
    .single()

  if (error || !proposal) {
    throw new Error(error?.message ?? 'Proposal not found')
  }

  // Resolve client name
  let clientName = 'Valued Client'
  if (proposal.client_contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('name, email')
      .eq('id', proposal.client_contact_id)
      .single()
    if (contact?.name) clientName = contact.name
  }

  // Org branding
  const { data: org } = await supabase
    .from('organizations')
    .select('name, slug')
    .eq('id', orgId)
    .single()

  const orgName = org?.name || 'All Webbed Up'
  const tiers = typeof proposal.pricing === 'string' ? JSON.parse(proposal.pricing) : proposal.pricing
  const subject = `Proposal: ${escapeHtml(proposal.title)}`

  const tiersHtml = (tiers as Array<{ tier: string; price: number; includes: string[] }>)
    .map(
      (t) => `
      <div style="flex:1;min-width:200px;border:1px solid #e2e8f0;border-radius:10px;padding:20px;background:#fff;">
        <h3 style="margin:0 0 8px;font-size:18px;color:#155dfc;">${escapeHtml(t.tier)}</h3>
        <p style="margin:0 0 16px;font-size:28px;font-weight:700;">${formatMoney(t.price)}</p>
        <ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#475569;line-height:1.8;">
          ${t.includes.map((i: string) => `<li>${escapeHtml(i)}</li>`).join('')}
        </ul>
      </div>`,
    )
    .join('')

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8" /><title>${subject}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px;">
  <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <header style="padding:28px 24px;border-bottom:1px solid #e2e8f0;background:linear-gradient(135deg,#155dfc 0%,#0ea5e9 100%);">
      <h1 style="margin:0 0 6px;font-size:24px;color:#fff;">Proposal</h1>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.85);">${escapeHtml(orgName)}</p>
    </header>

    <section style="padding:24px;">
      <h2 style="margin:0 0 12px;font-size:20px;">${escapeHtml(proposal.title)}</h2>
      <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Prepared for:</strong> ${escapeHtml(clientName)}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;"><strong>Timeline:</strong> ${escapeHtml(proposal.timeline || 'TBD')}</p>

      <h3 style="margin:20px 0 8px;font-size:16px;">Scope</h3>
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.6;">${escapeHtml(proposal.scope || '')}</p>

      <h3 style="margin:20px 0 12px;font-size:16px;">Pricing Options</h3>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        ${tiersHtml}
      </div>
    </section>

    <section style="padding:0 24px 24px;">
      <h3 style="margin:20px 0 8px;font-size:16px;">Terms</h3>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">${escapeHtml(proposal.terms || 'Payment: 50% upfront, 50% on completion. Valid for 30 days.')}</p>
    </section>

    <footer style="padding:18px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;">
      <p style="margin:0;font-size:12px;color:#64748b;">Generated by ${escapeHtml(orgName)} Proposal Bot</p>
    </footer>
  </div>
</body>
</html>`

  return { subject, html }
}

// ---------------------------------------------------------------------------
// Send Proposal (via approval queue then email)
// ---------------------------------------------------------------------------

export async function sendProposal(
  supabase: SupabaseClient,
  orgId: string,
  proposalId: string,
  agentConfigId: string,
): Promise<{ status: 'queued'; approvalId: string }> {
  const { data: proposal } = await supabase
    .from('proposals')
    .select('title, client_contact_id')
    .eq('id', proposalId)
    .eq('org_id', orgId)
    .single()

  const approval = await createApproval(supabase, {
    org_id: orgId,
    agent_config_id: agentConfigId,
    action_type: 'proposal_send',
    action_payload: {
      proposal_id: proposalId,
    },
    action_summary: `Send proposal: ${proposal?.title ?? proposalId}`,
    confidence_score: 0,
    routing_decision: 'ask',
    priority: 'normal',
    context_snapshot: {
      source: 'proposal-bot',
      proposalId,
      clientContactId: proposal?.client_contact_id,
    },
  })

  return { status: 'queued', approvalId: approval.id }
}

// ---------------------------------------------------------------------------
// Full Proposal Generation Flow
// ---------------------------------------------------------------------------

export async function generateProposal(
  supabase: SupabaseClient,
  orgId: string,
  brief: ProposalBrief,
): Promise<GeneratedProposal> {
  const scope = await generateScopeDocument(supabase, orgId, brief)
  const tiers = await generatePricing(supabase, orgId, scope, brief.budget)

  // Resolve contact ID
  let clientContactId: string | null = null
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('org_id', orgId)
    .eq('slug', brief.clientSlug)
    .single()

  if (contact) {
    clientContactId = contact.id
  }

  const proposal: GeneratedProposal = {
    title: scope.title,
    clientName: scope.clientName,
    projectType: scope.projectType,
    scope: brief.requirements,
    tiers,
    timeline: scope.timeline,
    terms: 'Payment: 50% upfront, 50% on completion. Valid for 30 days.',
  }

  // Save to proposals table
  await supabase.from('proposals').insert({
    org_id: orgId,
    client_contact_id: clientContactId,
    title: proposal.title,
    project_type: brief.projectType,
    scope: brief.requirements,
    pricing: JSON.stringify(tiers),
    timeline: proposal.timeline,
    terms: proposal.terms,
    status: 'draft',
    metadata: {
      notes: brief.notes,
      scope_document: scope,
      componentIds: brief.componentIds,
    },
  })

  return proposal
}

// ---------------------------------------------------------------------------
// Status Tracking
// ---------------------------------------------------------------------------

export async function updateProposalStatus(
  supabase: SupabaseClient,
  orgId: string,
  proposalId: string,
  status: ProposalStatus,
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'sent') updates.sent_at = new Date().toISOString()
  if (status === 'viewed') updates.viewed_at = new Date().toISOString()
  if (status === 'accepted') updates.accepted_at = new Date().toISOString()

  await supabase
    .from('proposals')
    .update(updates)
    .eq('id', proposalId)
    .eq('org_id', orgId)
}

export async function recordProposalView(
  supabase: SupabaseClient,
  orgId: string,
  proposalId: string,
): Promise<void> {
  // Only transition from sent -> viewed
  const { data } = await supabase
    .from('proposals')
    .select('status')
    .eq('id', proposalId)
    .eq('org_id', orgId)
    .single()

  if (data?.status === 'sent') {
    await updateProposalStatus(supabase, orgId, proposalId, 'viewed')
  }

  // Log view event in activity feed
  await supabase.from('activity_feed').insert({
    org_id: orgId,
    action_type: 'proposal_viewed',
    action: `Proposal ${proposalId} was viewed`,
    reasoning: 'Client opened the proposal link',
    result: JSON.stringify({ proposalId }),
  })
}

export async function listProposals(
  supabase: SupabaseClient,
  orgId: string,
  status?: string,
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

// ---------------------------------------------------------------------------
// Follow-Up Sequences (scheduler tick)
// ---------------------------------------------------------------------------

const FOLLOW_UP_DAYS = 3 // Send follow-up after 3 days with no view

export async function processProposalFollowUps(
  supabase: SupabaseClient,
  orgId: string,
  agentConfigId: string,
): Promise<{ followUpsSent: number; failed: number }> {
  const result = { followUpsSent: 0, failed: 0 }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - FOLLOW_UP_DAYS)

  // Find sent proposals older than cutoff that haven't been viewed/accepted
  const { data: staleProposals, error } = await supabase
    .from('proposals')
    .select('id, title, client_contact_id, sent_at, metadata')
    .eq('org_id', orgId)
    .eq('status', 'sent')
    .lt('sent_at', cutoff.toISOString())

  if (error || !staleProposals) return result

  for (const proposal of staleProposals) {
    try {
      const metadata = (proposal.metadata ?? {}) as Record<string, unknown>
      const followUpCount = typeof metadata.follow_up_count === 'number' ? metadata.follow_up_count : 0

      // Max 2 follow-ups
      if (followUpCount >= 2) continue

      // Queue follow-up approval
      await createApproval(supabase, {
        org_id: orgId,
        agent_config_id: agentConfigId,
        action_type: 'proposal_follow_up',
        action_payload: {
          proposal_id: proposal.id,
          follow_up_number: followUpCount + 1,
        },
        action_summary: `Follow-up #${followUpCount + 1} for proposal: ${proposal.title}`,
        confidence_score: 0,
        routing_decision: 'ask',
        priority: 'low',
        context_snapshot: {
          source: 'proposal-bot',
          proposalId: proposal.id,
          sentAt: proposal.sent_at,
          followUpCount,
        },
      })

      // Increment follow-up count
      await supabase
        .from('proposals')
        .update({
          metadata: { ...metadata, follow_up_count: followUpCount + 1, last_follow_up_at: new Date().toISOString() },
        })
        .eq('id', proposal.id)

      result.followUpsSent += 1
    } catch {
      result.failed += 1
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Scheduler Tick
// ---------------------------------------------------------------------------

export async function runProposalBotTick(
  supabase: SupabaseClient,
  orgId: string,
  agentConfigId: string,
): Promise<ProposalBotTickResult> {
  const result: ProposalBotTickResult = { processed: 0, followUpsSent: 0, failed: 0 }

  try {
    // Process approved proposal sends
    const { data: sendApprovals, error: sendError } = await supabase
      .from('approval_queue')
      .select('id, action_payload')
      .eq('org_id', orgId)
      .eq('action_type', 'proposal_send')
      .eq('status', 'approved')

    if (!sendError && sendApprovals) {
      for (const approval of sendApprovals as Array<{ id: string; action_payload: Record<string, unknown> }>) {
        result.processed += 1
        try {
          const proposalId = approval.action_payload.proposal_id as string
          if (!proposalId) continue

          // Generate PDF HTML
          const pdf = await generateProposalPdf(supabase, orgId, proposalId)

          // Resolve client email
          const { data: proposal } = await supabase
            .from('proposals')
            .select('client_contact_id')
            .eq('id', proposalId)
            .single()

          if (proposal?.client_contact_id) {
            const { data: contact } = await supabase
              .from('contacts')
              .select('email')
              .eq('id', proposal.client_contact_id)
              .single()

            if (contact?.email) {
              // Send via Resend (lazy import to avoid circular deps)
              const { sendInvoiceEmail } = await import('@/lib/email/send-invoice')
              await sendInvoiceEmail({
                to: contact.email,
                invoiceNumber: proposalId,
                html: pdf.html,
                subject: pdf.subject,
              })
            }
          }

          await updateProposalStatus(supabase, orgId, proposalId, 'sent')

          // Mark approval processed
          await supabase
            .from('approval_queue')
            .update({ status: 'approved', resolved_at: new Date().toISOString() })
            .eq('id', approval.id)
        } catch {
          result.failed += 1
        }
      }
    }

    // Process follow-ups
    const followUps = await processProposalFollowUps(supabase, orgId, agentConfigId)
    result.followUpsSent += followUps.followUpsSent
    result.failed += followUps.failed
  } catch {
    result.failed += 1
  }

  return result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const proposalBot = {
  generate: generateProposal,
  generateScope: generateScopeDocument,
  generatePricing,
  generatePdf: generateProposalPdf,
  send: sendProposal,
  updateStatus: updateProposalStatus,
  recordView: recordProposalView,
  list: listProposals,
  tick: runProposalBotTick,
}
