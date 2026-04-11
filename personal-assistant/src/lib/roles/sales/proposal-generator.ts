import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoleContext } from '../role-runtime'
import type { RoleAction, RoleInsight } from '../role-registry'
import {
  runProposalBotTick,
  generateProposal,
  type ProposalBotTickResult,
  type ProposalBrief,
  type GeneratedProposal,
} from '@/lib/agent/proposal-bot'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WrappedProposalTickResult {
  actions: RoleAction[]
  insights: RoleInsight[]
  raw: ProposalBotTickResult | null
}

export interface ProposalWithContext extends GeneratedProposal {
  pricingContext?: PricingContextItem[]
}

export interface PricingContextItem {
  projectType: string
  clientName: string
  amount: number
  date: string
  source: 'invoice' | 'proposal'
}

// ---------------------------------------------------------------------------
// Pricing Context: Query Past Projects for Pricing Intelligence
// ---------------------------------------------------------------------------

/**
 * Fetches historical pricing data from past invoices and accepted proposals
 * to inform new proposal pricing. This gives the proposal generator context
 * about what the org has charged for similar work.
 */
export async function fetchPricingContext(
  supabase: SupabaseClient,
  orgId: string,
  projectType?: string,
): Promise<PricingContextItem[]> {
  const items: PricingContextItem[] = []

  try {
    // 1. Past invoices (paid or sent) for pricing reference
    let invoiceQuery = supabase
      .from('invoices')
      .select('id, total, currency, created_at, client_contact_id, metadata')
      .eq('org_id', orgId)
      .in('status', ['paid', 'sent', 'viewed'])
      .order('created_at', { ascending: false })
      .limit(20)

    const { data: invoices } = await invoiceQuery

    if (invoices) {
      for (const inv of invoices) {
        const metadata = (inv.metadata ?? {}) as Record<string, unknown>
        const invProjectType = (metadata.project_type as string) ?? 'unknown'

        // If filtering by project type, only include matches
        if (projectType && invProjectType !== projectType && invProjectType !== 'unknown') {
          continue
        }

        // Resolve contact name
        let clientName = 'Unknown'
        if (inv.client_contact_id) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('name')
            .eq('id', inv.client_contact_id)
            .single()
          if (contact?.name) clientName = contact.name
        }

        items.push({
          projectType: invProjectType,
          clientName,
          amount: Number(inv.total) || 0,
          date: (inv.created_at as string).slice(0, 10),
          source: 'invoice',
        })
      }
    }

    // 2. Past proposals (accepted or sent) for pricing reference
    let proposalQuery = supabase
      .from('proposals')
      .select('id, title, project_type, pricing, client_contact_id, created_at, status')
      .eq('org_id', orgId)
      .in('status', ['accepted', 'sent', 'viewed'])
      .order('created_at', { ascending: false })
      .limit(20)

    const { data: proposals } = await proposalQuery

    if (proposals) {
      for (const prop of proposals) {
        if (projectType && prop.project_type !== projectType) {
          continue
        }

        // Parse pricing to get the standard tier price
        let amount = 0
        try {
          const tiers = typeof prop.pricing === 'string'
            ? JSON.parse(prop.pricing)
            : prop.pricing
          if (Array.isArray(tiers)) {
            const standard = tiers.find((t: { tier: string }) =>
              t.tier.toLowerCase().includes('standard'),
            )
            amount = standard?.price ?? tiers[0]?.price ?? 0
          }
        } catch {
          // Skip malformed pricing
        }

        let clientName = 'Unknown'
        if (prop.client_contact_id) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('name')
            .eq('id', prop.client_contact_id)
            .single()
          if (contact?.name) clientName = contact.name
        }

        items.push({
          projectType: prop.project_type as string,
          clientName,
          amount,
          date: (prop.created_at as string).slice(0, 10),
          source: 'proposal',
        })
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`[proposal-generator] Failed to fetch pricing context: ${message}`)
  }

  return items
}

// ---------------------------------------------------------------------------
// Wrapped Proposal Bot Tick
// ---------------------------------------------------------------------------

/**
 * Wraps the existing runProposalBotTick() function and translates
 * ProposalBotTickResult into role actions and insights.
 *
 * This function does NOT modify proposal-bot.ts. It only calls it
 * and maps its outputs to the role engine format.
 */
export async function runWrappedProposalTick(
  ctx: RoleContext,
): Promise<WrappedProposalTickResult> {
  const tag = `[proposal-generator:${ctx.orgId.slice(0, 8)}]`
  const actions: RoleAction[] = []
  const insights: RoleInsight[] = []

  let proposalResult: ProposalBotTickResult | null = null

  try {
    proposalResult = await runProposalBotTick(
      ctx.supabase,
      ctx.orgId,
      ctx.config.id,
    )

    logger.info(
      `${tag} Proposal tick: ${proposalResult.processed} processed, ` +
      `${proposalResult.followUpsSent} follow-ups, ${proposalResult.failed} failed`,
    )

    // Convert processed proposals to role actions
    if (proposalResult.processed > 0) {
      actions.push({
        type: 'proposal_processed',
        summary: `Processed ${proposalResult.processed} approved proposal action${proposalResult.processed > 1 ? 's' : ''} (send/follow-up)`,
        payload: { count: proposalResult.processed },
        confidence: 1.0,
        reversible: false,
      })
    }

    // Surface follow-ups as actions
    if (proposalResult.followUpsSent > 0) {
      actions.push({
        type: 'proposal_follow_up',
        summary: `Queued ${proposalResult.followUpsSent} proposal follow-up${proposalResult.followUpsSent > 1 ? 's' : ''}`,
        payload: { count: proposalResult.followUpsSent },
        confidence: 0.85,
        reversible: true,
      })
    }

    // Surface failures as insight
    if (proposalResult.failed > 0) {
      insights.push({
        summary: `${proposalResult.failed} proposal operation${proposalResult.failed > 1 ? 's' : ''} failed during tick`,
        details: { count: proposalResult.failed },
        priority: 'high',
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`${tag} Proposal tick failed: ${message}`)
    insights.push({
      summary: `Proposal tick failed: ${message}`,
      details: { error: message },
      priority: 'high',
    })
  }

  return {
    actions,
    insights,
    raw: proposalResult,
  }
}

// ---------------------------------------------------------------------------
// Generate Proposal with Pricing Context
// ---------------------------------------------------------------------------

/**
 * Enhanced proposal generation that queries past projects/invoices
 * for pricing context before generating. Uses existing generateProposal()
 * from proposal-bot.ts under the hood.
 */
export async function generateProposalWithContext(
  supabase: SupabaseClient,
  orgId: string,
  brief: ProposalBrief,
): Promise<ProposalWithContext> {
  // Fetch pricing context from historical data
  const pricingContext = await fetchPricingContext(supabase, orgId, brief.projectType)

  // If we have historical data and no budget specified, use median as hint
  if (!brief.budget && pricingContext.length > 0) {
    const amounts = pricingContext
      .map((p) => p.amount)
      .filter((a) => a > 0)
      .sort((a, b) => a - b)

    if (amounts.length > 0) {
      const median = amounts[Math.floor(amounts.length / 2)]
      // Use median as budget hint (proposal-bot will generate tiers around it)
      brief = { ...brief, budget: median }
      logger.info(
        `[proposal-generator] Using historical median $${median} as pricing baseline ` +
        `(from ${amounts.length} past ${brief.projectType} projects)`,
      )
    }
  }

  const proposal = await generateProposal(supabase, orgId, brief)

  return {
    ...proposal,
    pricingContext,
  }
}
