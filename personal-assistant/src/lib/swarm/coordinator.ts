/**
 * Swarm Coordinator
 *
 * Haiku-powered brain that:
 * 1. Classifies natural language triggers into swarm templates
 * 2. Extracts parameters from context
 * 3. Creates and manages swarm runs
 * 4. Delegates execution to SwarmExecutor
 *
 * Uses classification-tier model (Haiku) for planning — only escalates
 * to Sonnet/Opus for actual step execution.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CoordinatorClassification,
  SwarmDefinition,
  SwarmTemplateRow,
  SwarmRunRow,
  SwarmEvent,
  SwarmRunStatus,
} from './types'
import { BUILTIN_TEMPLATES, matchTemplate, type BuiltinTemplate } from './templates'
import { SwarmExecutor, rollbackSwarm } from './executor'
import { resolveModel } from '@/lib/agent/model-registry'
import { logger } from '@/lib/core/logger'

// ── Coordinator ─────────────────────────────────────────────────────────────

export class SwarmCoordinator {
  private supabase: SupabaseClient
  private orgId: string

  constructor(supabase: SupabaseClient, orgId: string) {
    this.supabase = supabase
    this.orgId = orgId
  }

  /**
   * Process a natural language trigger and execute the matching swarm.
   * This is the main entry point for swarm orchestration.
   */
  async trigger(
    input: string,
    options?: {
      templateSlug?: string           // explicit template selection
      params?: Record<string, unknown> // pre-filled parameters
      triggerType?: string             // chat, api, cron
      parentRunId?: string             // for sub-swarm composition
      parentStepId?: string
      onEvent?: (event: SwarmEvent) => void
    },
  ): Promise<{ runId: string; status: SwarmRunStatus; summary: string | null }> {
    const triggerType = options?.triggerType || 'chat'

    // Step 1: Classify the input (or use explicit template)
    let template: { slug: string; definition: SwarmDefinition; templateId?: string } | null = null
    let params: Record<string, unknown> = options?.params || {}

    if (options?.templateSlug) {
      // Explicit template selection
      template = await this.loadTemplate(options.templateSlug)
      if (!template) {
        throw new Error(`Template "${options.templateSlug}" not found`)
      }
    } else {
      // NL classification
      const classification = await this.classify(input)

      if (!classification.templateSlug) {
        throw new Error('No matching swarm template found for this request')
      }

      template = await this.loadTemplate(classification.templateSlug)
      if (!template) {
        throw new Error(`Template "${classification.templateSlug}" not found`)
      }

      params = { ...classification.extractedParams, ...params }
    }

    // Step 2: Create swarm run
    const run = await this.createRun({
      templateId: template.templateId,
      templateSlug: template.slug,
      triggerType,
      triggerInput: input,
      triggerParams: params,
      parentRunId: options?.parentRunId,
      parentStepId: options?.parentStepId,
    })

    // Step 3: Execute
    const executor = new SwarmExecutor({
      orgId: this.orgId,
      supabase: this.supabase,
      runId: run.id,
      definition: template.definition,
      params: { ...params, _templateId: template.templateId },
      onEvent: options?.onEvent,
    })

    const result = await executor.execute()

    return {
      runId: run.id,
      status: result.status,
      summary: result.summary,
    }
  }

  /**
   * Classify a natural language input into a swarm template.
   * Uses Haiku for cost optimization.
   */
  async classify(input: string): Promise<CoordinatorClassification> {
    // Fast path: regex pattern matching against known templates
    const regexMatch = matchTemplate(input)
    if (regexMatch) {
      // Extract parameters using Haiku
      const params = await this.extractParams(input, regexMatch)
      return {
        templateSlug: regexMatch.slug,
        confidence: 0.9,
        extractedParams: params,
        reasoning: `Matched trigger pattern for "${regexMatch.name}"`,
      }
    }

    // Load custom templates from DB
    const { data: dbTemplates } = await this.supabase
      .from('swarm_templates')
      .select('slug, name, description, trigger_patterns, definition')
      .eq('org_id', this.orgId)
      .eq('is_active', true)

    // Build template catalog for LLM classification
    const allTemplates = [
      ...BUILTIN_TEMPLATES.map(t => ({
        slug: t.slug,
        name: t.name,
        description: t.description,
      })),
      ...(dbTemplates || []).map((t: { slug: string; name: string; description: string | null }) => ({
        slug: t.slug,
        name: t.name,
        description: t.description,
      })),
    ]

    // Use Haiku to classify
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const systemPrompt = `You are a swarm template classifier for BitBit, an AI operations platform for agencies.
Given a user request, determine which swarm template (if any) should be triggered, and extract the parameters.

Available templates:
${allTemplates.map(t => `- ${t.slug}: ${t.name} — ${t.description}`).join('\n')}

Return JSON:
{
  "templateSlug": "<slug or null if no match>",
  "confidence": <0-1>,
  "extractedParams": { <key: value pairs extracted from input> },
  "reasoning": "<brief explanation>"
}

Extract these common parameters when present:
- clientName: the client/company being discussed
- contactEmail: any email mentioned
- projectType: type of project/work
- projectValue: monetary amount
- deadline: any deadline mentioned
- month: any month/period mentioned

Only match a template if the user's intent clearly aligns. Return null for general conversation.
Return ONLY JSON, no markdown fences.`

    try {
      const response = await client.messages.create({
        model: resolveModel('classification'),
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: input }],
      })

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('')

      const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(cleaned)

      return {
        templateSlug: parsed.templateSlug || null,
        confidence: Number(parsed.confidence) || 0,
        extractedParams: parsed.extractedParams || {},
        reasoning: String(parsed.reasoning || ''),
      }
    } catch (err) {
      logger.warn('[swarm-coordinator] Classification failed', { error: err })
      return {
        templateSlug: null,
        confidence: 0,
        extractedParams: {},
        reasoning: 'Classification failed',
      }
    }
  }

  /**
   * Extract parameters from input for a known template.
   * Uses Haiku for speed and cost.
   */
  private async extractParams(
    input: string,
    template: BuiltinTemplate,
  ): Promise<Record<string, unknown>> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const paramSchema = template.definition.inputSchema
    const paramList = Object.entries(paramSchema)
      .map(([key, spec]) => `- ${key} (${spec.type}${spec.required ? ', required' : ''}): ${spec.description}`)
      .join('\n')

    try {
      const response = await client.messages.create({
        model: resolveModel('classification'),
        max_tokens: 256,
        system: `Extract parameters from the user request for the "${template.name}" operation.

Expected parameters:
${paramList}

Return ONLY a JSON object with the extracted values. Use null for parameters not mentioned. No markdown fences.`,
        messages: [{ role: 'user', content: input }],
      })

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('')

      const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(cleaned)

      // Apply defaults for missing required params
      for (const [key, spec] of Object.entries(paramSchema)) {
        if (parsed[key] === null || parsed[key] === undefined) {
          if (spec.default !== undefined) {
            parsed[key] = spec.default
          }
        }
      }

      return parsed
    } catch {
      // Fallback: simple extraction
      return this.simpleExtract(input)
    }
  }

  /**
   * Simple parameter extraction without LLM.
   */
  private simpleExtract(input: string): Record<string, unknown> {
    const params: Record<string, unknown> = {}

    // Extract client name (common pattern: "for <name>")
    const forMatch = input.match(/\bfor\s+([A-Z][a-zA-Z\s]+?)(?:\s+(?:pitch|project|work|meeting|client)|[.,!?]|$)/i)
    if (forMatch) {
      params.clientName = forMatch[1].trim()
    }

    // Extract email
    const emailMatch = input.match(/[\w.+-]+@[\w-]+\.[\w.]+/)
    if (emailMatch) {
      params.contactEmail = emailMatch[0]
    }

    // Extract monetary amount
    const moneyMatch = input.match(/\$[\d,]+(?:\.\d{2})?/)
    if (moneyMatch) {
      params.projectValue = parseFloat(moneyMatch[0].replace(/[$,]/g, ''))
    }

    return params
  }

  // ── Template Loading ──────────────────────────────────────────────────

  /**
   * Load a template by slug — check DB first, then fall back to builtins.
   */
  private async loadTemplate(
    slug: string,
  ): Promise<{ slug: string; definition: SwarmDefinition; templateId?: string } | null> {
    // Try DB first
    const { data: dbTemplate } = await this.supabase
      .from('swarm_templates')
      .select('id, slug, definition')
      .eq('org_id', this.orgId)
      .eq('slug', slug)
      .eq('is_active', true)
      .single()

    if (dbTemplate) {
      return {
        slug: dbTemplate.slug,
        definition: dbTemplate.definition as SwarmDefinition,
        templateId: dbTemplate.id,
      }
    }

    // Fall back to builtin
    const builtin = BUILTIN_TEMPLATES.find(t => t.slug === slug)
    if (builtin) {
      // Seed the builtin template into DB for metrics tracking
      const templateId = await this.seedBuiltinTemplate(builtin)
      return {
        slug: builtin.slug,
        definition: builtin.definition,
        templateId: templateId || undefined,
      }
    }

    return null
  }

  /**
   * Seed a builtin template into the database for this org.
   */
  private async seedBuiltinTemplate(template: BuiltinTemplate): Promise<string | null> {
    try {
      const { data } = await this.supabase
        .from('swarm_templates')
        .insert({
          org_id: this.orgId,
          name: template.name,
          slug: template.slug,
          description: template.description,
          category: template.category,
          trigger_patterns: template.triggerPatterns,
          definition: template.definition,
          governance: template.definition.governance,
          is_builtin: true,
        })
        .select('id')
        .single()

      return data?.id || null
    } catch (err) {
      // Might already exist (unique constraint on org_id + slug)
      const { data: existing } = await this.supabase
        .from('swarm_templates')
        .select('id')
        .eq('org_id', this.orgId)
        .eq('slug', template.slug)
        .single()

      return existing?.id || null
    }
  }

  // ── Run Management ────────────────────────────────────────────────────

  private async createRun(args: {
    templateId?: string
    templateSlug: string
    triggerType: string
    triggerInput: string
    triggerParams: Record<string, unknown>
    parentRunId?: string
    parentStepId?: string
  }): Promise<SwarmRunRow> {
    const { data, error } = await this.supabase
      .from('swarm_runs')
      .insert({
        org_id: this.orgId,
        template_id: args.templateId || null,
        template_slug: args.templateSlug,
        trigger_type: args.triggerType,
        trigger_input: args.triggerInput,
        trigger_params: args.triggerParams,
        parent_run_id: args.parentRunId || null,
        parent_step_id: args.parentStepId || null,
        status: 'planning',
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create swarm run: ${error.message}`)
    }

    return data as SwarmRunRow
  }

  // ── Query Methods ─────────────────────────────────────────────────────

  /**
   * List swarm runs with optional filtering.
   */
  async listRuns(options?: {
    status?: SwarmRunStatus | SwarmRunStatus[]
    limit?: number
    offset?: number
  }): Promise<SwarmRunRow[]> {
    let query = this.supabase
      .from('swarm_runs')
      .select('*')
      .eq('org_id', this.orgId)
      .order('created_at', { ascending: false })
      .limit(options?.limit ?? 20)

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit ?? 20) - 1)
    }

    if (options?.status) {
      if (Array.isArray(options.status)) {
        query = query.in('status', options.status)
      } else {
        query = query.eq('status', options.status)
      }
    }

    const { data } = await query
    return (data || []) as SwarmRunRow[]
  }

  /**
   * Get a single run with steps and messages.
   */
  async getRun(runId: string): Promise<{
    run: SwarmRunRow
    steps: import('./types').SwarmStepRow[]
    messages: import('./types').SwarmMessageRow[]
  } | null> {
    const [runResult, stepsResult, messagesResult] = await Promise.all([
      this.supabase
        .from('swarm_runs')
        .select('*')
        .eq('id', runId)
        .eq('org_id', this.orgId)
        .single(),
      this.supabase
        .from('swarm_steps')
        .select('*')
        .eq('run_id', runId)
        .eq('org_id', this.orgId)
        .order('created_at', { ascending: true }),
      this.supabase
        .from('swarm_messages')
        .select('*')
        .eq('run_id', runId)
        .eq('org_id', this.orgId)
        .order('created_at', { ascending: true }),
    ])

    if (!runResult.data) return null

    return {
      run: runResult.data as SwarmRunRow,
      steps: (stepsResult.data || []) as import('./types').SwarmStepRow[],
      messages: (messagesResult.data || []) as import('./types').SwarmMessageRow[],
    }
  }

  /**
   * List available templates.
   */
  async listTemplates(): Promise<SwarmTemplateRow[]> {
    const { data } = await this.supabase
      .from('swarm_templates')
      .select('*')
      .eq('org_id', this.orgId)
      .eq('is_active', true)
      .order('total_runs', { ascending: false })

    return (data || []) as SwarmTemplateRow[]
  }

  /**
   * Rollback a swarm run.
   */
  async rollback(runId: string): Promise<{ success: boolean; rolledBack: number; errors: string[] }> {
    return rollbackSwarm(this.supabase, runId, this.orgId)
  }
}
