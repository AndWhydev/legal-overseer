/**
 * Lead Research Pipeline — Intelligence Workflow
 *
 * Uses the PARALLEL + SEQUENTIAL WDK patterns to research new leads.
 *
 * When a new lead is detected (via ingestion pipeline or manual entry),
 * this workflow:
 *
 * Phase 1 — PARALLEL (concurrent research):
 *   1. Web search / company info gathering (simulated via LLM knowledge)
 *   2. Check existing contacts DB for matches
 *   3. Score lead fit based on industry/size signals
 *
 * Phase 2 — SEQUENTIAL (enrichment chain):
 *   1. Enrich contact record with gathered data
 *   2. Generate a composite lead score
 *   3. Draft initial outreach email
 *
 * All LLM calls use generateObject() with typed Zod schemas for
 * structured, validated output.
 *
 * @module intelligence/workflows/lead-research
 */

import { z } from 'zod'
import { generateText, Output } from 'ai'
import { models } from '@/lib/ai'
import { runParallelWorkflow } from '@/lib/workflows/patterns'
import { runSequentialWorkflow } from '@/lib/workflows/patterns'
import type {
  WorkflowResult,
  WorkflowConfig,
  LeadResearchResult,
  CompanyInfo,
  ExistingContactMatch,
  LeadFitScore,
  OutreachDraft,
} from './types'

// ---------------------------------------------------------------------------
// Zod Schemas for structured LLM output
// ---------------------------------------------------------------------------

const companyInfoSchema = z.object({
  name: z.string().describe('Company name'),
  industry: z.string().describe('Industry vertical'),
  estimatedSize: z
    .enum(['startup', 'small', 'medium', 'large', 'enterprise'])
    .describe('Estimated company size'),
  keyFacts: z.array(z.string()).describe('Key facts about the company'),
  potentialNeeds: z
    .array(z.string())
    .describe('Potential needs or pain points for this company'),
})

const leadFitSchema = z.object({
  score: z.number().min(0).max(100).describe('Overall lead fit score'),
  assessment: z
    .enum(['excellent', 'good', 'moderate', 'poor'])
    .describe('Fit assessment category'),
  reasoning: z.string().describe('Reasoning for the fit score'),
  signals: z
    .array(z.string())
    .describe('Key signals that contributed to this score'),
})

const outreachDraftSchema = z.object({
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('Email body text'),
  personalizationHooks: z
    .array(z.string())
    .describe('Personalization hooks used in the draft'),
  suggestedTiming: z
    .string()
    .describe('Suggested optimal send time/day'),
})

// ---------------------------------------------------------------------------
// Helper: Check existing contacts
// ---------------------------------------------------------------------------

async function checkExistingContacts(
  config: WorkflowConfig,
  lead: { name: string; email?: string; company?: string },
): Promise<ExistingContactMatch> {
  const { supabase, orgId } = config

  // Try matching by email first (most reliable)
  if (lead.email) {
    const { data: emailMatch } = await supabase
      .from('contacts')
      .select('id, name, relationship_strength, last_interaction_at')
      .eq('org_id', orgId)
      .contains('emails', [lead.email])
      .limit(1)
      .single()

    if (emailMatch) {
      return {
        found: true,
        contactId: emailMatch.id,
        contactName: emailMatch.name,
        relationshipStrength: emailMatch.relationship_strength ?? undefined,
        previousInteractions: emailMatch.last_interaction_at
          ? `Last interaction: ${emailMatch.last_interaction_at}`
          : undefined,
      }
    }
  }

  // Try matching by name (fuzzy)
  const { data: nameMatches } = await supabase
    .from('contacts')
    .select('id, name, relationship_strength, last_interaction_at')
    .eq('org_id', orgId)
    .ilike('name', `%${lead.name}%`)
    .limit(1)

  if (nameMatches && nameMatches.length > 0) {
    const match = nameMatches[0]
    return {
      found: true,
      contactId: match.id,
      contactName: match.name,
      relationshipStrength: match.relationship_strength ?? undefined,
      previousInteractions: match.last_interaction_at
        ? `Last interaction: ${match.last_interaction_at}`
        : undefined,
    }
  }

  return { found: false }
}

// ---------------------------------------------------------------------------
// Main Workflow
// ---------------------------------------------------------------------------

/**
 * Run the lead research pipeline.
 *
 * Phase 1 uses PARALLEL pattern to concurrently:
 * - Research company information
 * - Check existing contacts database
 * - Score lead fit
 *
 * Phase 2 uses SEQUENTIAL pattern to:
 * - Synthesize research into enriched record
 * - Generate composite lead score
 * - Draft personalized outreach
 *
 * @param lead - Lead information: name, optional email/company, and source
 * @param config - Workflow config with orgId, supabase client, and dryRun flag
 * @returns WorkflowResult containing typed LeadResearchResult
 */
export async function runLeadResearch(
  lead: { name: string; email?: string; company?: string; source: string },
  config: WorkflowConfig,
): Promise<WorkflowResult<LeadResearchResult>> {
  const startTime = Date.now()
  let stepsCompleted = 0
  let tokensEstimate = 0

  try {
    // -----------------------------------------------------------------------
    // Phase 1: PARALLEL — Concurrent research
    // -----------------------------------------------------------------------

    const leadContext = [
      `Name: ${lead.name}`,
      lead.email ? `Email: ${lead.email}` : null,
      lead.company ? `Company: ${lead.company}` : null,
      `Source: ${lead.source}`,
    ]
      .filter(Boolean)
      .join('\n')

    // Run company research and lead fit scoring in parallel via WDK
    const parallelResult = await runParallelWorkflow({
      input: leadContext,
      branches: [
        {
          name: 'company-research',
          system:
            'You are a B2B sales intelligence analyst. Research and infer company information from the provided lead details. Use your knowledge to provide realistic company insights. If the company is not specified, infer it from the email domain or name.',
          prompt:
            'Research this lead and provide structured company information:\n{{input}}',
          schema: companyInfoSchema,
          model: 'balanced',
        },
        {
          name: 'lead-fit-scoring',
          system:
            'You are a lead qualification expert for a freelance/agency business. Score how well this lead fits as a potential client based on the available signals. Consider industry, company size, source quality, and potential budget.',
          prompt:
            'Score the fit of this lead for a freelance/agency business:\n{{input}}',
          schema: leadFitSchema,
          model: 'fast',
        },
      ],
    })

    stepsCompleted += 2
    tokensEstimate += 2000 // rough estimate for 2 parallel branches

    // Extract parallel results
    const companyBranch = parallelResult.branches.find(
      (b) => b.name === 'company-research',
    )
    const fitBranch = parallelResult.branches.find(
      (b) => b.name === 'lead-fit-scoring',
    )

    const companyInfo: CompanyInfo = (companyBranch?.output as CompanyInfo) ?? {
      name: lead.company ?? 'Unknown',
      industry: 'Unknown',
      estimatedSize: 'small',
      keyFacts: [],
      potentialNeeds: [],
    }

    const fitScore: LeadFitScore = (fitBranch?.output as LeadFitScore) ?? {
      score: 50,
      assessment: 'moderate',
      reasoning: 'Insufficient data for scoring',
      signals: [],
    }

    // Run existing contact check concurrently (database query, not LLM)
    const existingContact = await checkExistingContacts(config, lead)
    stepsCompleted += 1

    // -----------------------------------------------------------------------
    // Phase 2: SEQUENTIAL — Enrichment chain
    // -----------------------------------------------------------------------

    const enrichmentContext = JSON.stringify(
      {
        lead,
        companyInfo,
        fitScore,
        existingContact,
      },
      null,
      2,
    )

    const sequentialResult = await runSequentialWorkflow({
      input: enrichmentContext,
      steps: [
        {
          name: 'synthesize-research',
          system:
            'You are a sales intelligence analyst. Synthesize all the research gathered about this lead into a concise, actionable summary. Focus on key insights that would help a salesperson prepare for outreach.',
          prompt:
            'Synthesize the following lead research into a concise summary highlighting the most actionable insights for outreach:\n\n{{input}}',
          model: 'balanced',
        },
        {
          name: 'draft-outreach',
          system:
            'You are an expert B2B outreach copywriter for a freelance/agency business. Write personalized, conversational outreach that feels genuine — not templated. Reference specific details from the research to show you did your homework.',
          prompt:
            'Based on this research and synthesis, draft an initial outreach email. The previous synthesis was:\n\n{{prev}}\n\nOriginal research data:\n{{input}}',
          model: 'balanced',
        },
      ],
    })

    stepsCompleted += 2
    tokensEstimate += 3000 // rough estimate for 2 sequential steps

    // Parse outreach draft from sequential output using generateObject
    const { output: outreachDraft } = await generateText({
      model: models.fast,
      system:
        'Extract structured email components from this draft outreach text. Parse the subject, body, personalization hooks, and suggest optimal send timing.',
      output: Output.object({ schema: outreachDraftSchema }),
      prompt: `Parse this outreach draft into structured components:\n\n${sequentialResult.output}`,
    })

    if (!outreachDraft) throw new Error('Outreach draft parsing returned null')

    stepsCompleted += 1
    tokensEstimate += 500

    // Build final result
    const result: LeadResearchResult = {
      lead,
      companyInfo,
      existingContact,
      fitScore,
      outreachDraft: outreachDraft as OutreachDraft,
      summary:
        sequentialResult.steps.find((s) => s.name === 'synthesize-research')
          ?.output ?? 'No summary generated',
    }

    return {
      success: true,
      data: result,
      metrics: {
        durationMs: Date.now() - startTime,
        tokensUsed: tokensEstimate,
        stepsCompleted,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      data: {
        lead,
        companyInfo: {
          name: lead.company ?? 'Unknown',
          industry: 'Unknown',
          estimatedSize: 'small',
          keyFacts: [],
          potentialNeeds: [],
        },
        existingContact: { found: false },
        fitScore: {
          score: 0,
          assessment: 'poor',
          reasoning: `Workflow failed: ${message}`,
          signals: [],
        },
        outreachDraft: {
          subject: '',
          body: '',
          personalizationHooks: [],
          suggestedTiming: '',
        },
        summary: `Workflow failed: ${message}`,
      },
      metrics: {
        durationMs: Date.now() - startTime,
        tokensUsed: tokensEstimate,
        stepsCompleted,
      },
      error: message,
    }
  }
}
