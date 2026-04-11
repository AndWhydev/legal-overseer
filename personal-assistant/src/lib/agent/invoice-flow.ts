import type { SupabaseClient } from '@supabase/supabase-js'
import { createApproval } from './approval-queue'
import { createInvoice, searchContacts, type InvoiceLineItem } from './shared-tools'
import { resolveEntityRanked } from '@/lib/context/entity-resolver'
import { crossReference } from '@/lib/context/cross-reference'
import { checkOverdueInvoices, processApprovedInvoiceSends } from './invoice-sender'

interface RankedContactMatch {
  contact: {
    id: string
    name: string
  }
  matchConfidence: number
}

interface ExistingInvoiceRow {
  id: string
  invoice_number: string
  status: string
  total: number
  project_reference: string | null
  created_at: string
}

interface InvoiceNumberOrgRow {
  name: string | null
  slug: string | null
}

interface ApprovedInvoiceRow {
  id: string
  action_payload: Record<string, unknown>
}

export interface InvoiceIntent {
  source_intent: string
  contact_name: string | null
  project_reference: string | null
  amount: number | null
  currency: string
  terms_days: number
  line_items?: InvoiceLineItem[]
}

interface ResolvedInvoiceIntent {
  contactId: string
  contactName: string
  projectReference: string
  amount: number | null
  currency: string
  termsDays: number
  lineItems: InvoiceLineItem[]
}

export interface DuplicateInvoiceResult {
  isDuplicate: boolean
  existingInvoice: ExistingInvoiceRow | null
}

export type CreateInvoiceFromIntentResult =
  | { status: 'queued'; approvalId: string }
  | { status: 'created'; invoiceId: string; invoiceNumber: string }
  | { status: 'duplicate'; existingInvoiceId: string; existingInvoiceNumber: string | null; overrideApprovalId: string | null }
  | { status: 'error'; error: string }

export interface InvoiceFlowTickResult {
  processed: number
  created: number
  duplicatesBlocked: number
  sent: number
  overdue: number
  failed: number
}

interface CreateInvoiceOptions {
  requireApproval?: boolean
  allowDuplicateOverride?: boolean
  sourceApprovalId?: string
}

function parseNumericAmount(value: string): number | null {
  const match = value.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)(\s*[kKmM])?/) 
  if (!match) return null

  const base = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(base)) return null

  const suffix = (match[2] ?? '').trim().toLowerCase()
  if (suffix === 'k') return base * 1000
  if (suffix === 'm') return base * 1_000_000
  return base
}

function normalizeTermsDays(value: number | null | undefined): number {
  if (value === 7 || value === 14 || value === 30) return value
  return 14
}

export function normalizeProjectReference(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(work|project|job|updates|changes)\b/gi, '')
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function fuzzyProjectMatch(a: string, b: string): boolean {
  const normA = normalizeProjectReference(a)
  const normB = normalizeProjectReference(b)
  if (!normA || !normB) return false
  if (normA === normB) return true
  return normA.includes(normB) || normB.includes(normA)
}

function amountWithinTolerance(a: number, b: number, tolerance = 0.10): boolean {
  const maxVal = Math.max(a, b)
  if (maxVal <= 0) return false
  return Math.abs(a - b) / maxVal <= tolerance
}

function cleanProjectReference(value: string): string {
  return value
    .replace(/\$\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*[kKmM]?/g, '')
    .replace(/\b(net\s*)?(7|14|30)\s*-?\s*day(s)?\b/gi, '')
    .replace(/\bterms\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildLineItems(projectReference: string, amount: number, existing?: InvoiceLineItem[]): InvoiceLineItem[] {
  if (Array.isArray(existing) && existing.length > 0) {
    return existing.map((item) => ({
      description: item.description,
      quantity: Number.isFinite(item.quantity) ? item.quantity : 1,
      unit_price: Number.isFinite(item.unit_price) ? item.unit_price : item.total,
      total: Number.isFinite(item.total)
        ? item.total
        : (Number.isFinite(item.quantity) ? item.quantity : 1) * (Number.isFinite(item.unit_price) ? item.unit_price : 0),
    }))
  }

  return [
    {
      description: projectReference || 'Services rendered',
      quantity: 1,
      unit_price: amount,
      total: amount,
    },
  ]
}

function deriveOrgPrefix(org: InvoiceNumberOrgRow | null, orgId: string): string {
  const fromName = (org?.name ?? '').trim()
  const fromSlug = (org?.slug ?? '').trim()

  if (fromName.length > 0) {
    const words = fromName
      .split(/[^a-zA-Z0-9]+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 0)

    if (words.length >= 2) {
      return words
        .slice(0, 4)
        .map((word) => word[0])
        .join('')
        .toUpperCase()
    }
  }

  if (fromSlug.length > 0) {
    const parts = fromSlug
      .split(/[^a-zA-Z0-9]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)

    if (parts.length >= 2) {
      return parts
        .slice(0, 4)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
    }

    const compact = fromSlug.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    if (compact.length > 0) {
      return compact.slice(0, 4)
    }
  }

  return orgId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'ORG'
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readPayloadNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function readPayloadLineItems(payload: Record<string, unknown>): InvoiceLineItem[] | undefined {
  const rawItems = payload.line_items
  if (!Array.isArray(rawItems)) return undefined

  const parsed = rawItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      if (typeof row.description !== 'string') return null
      const quantity = typeof row.quantity === 'number' ? row.quantity : 1
      const unitPrice = typeof row.unit_price === 'number' ? row.unit_price : 0
      const total = typeof row.total === 'number' ? row.total : quantity * unitPrice
      return {
        description: row.description,
        quantity,
        unit_price: unitPrice,
        total,
      }
    })
    .filter((item): item is InvoiceLineItem => Boolean(item))

  return parsed.length > 0 ? parsed : undefined
}

function intentToPayload(intent: InvoiceIntent): Record<string, unknown> {
  return {
    source_intent: intent.source_intent,
    contact_name: intent.contact_name,
    project_reference: intent.project_reference,
    amount: intent.amount,
    currency: intent.currency,
    terms_days: intent.terms_days,
    line_items: intent.line_items ?? [],
  }
}

function payloadToIntent(payload: Record<string, unknown>): InvoiceIntent {
  const nested = payload.intent
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return payloadToIntent(nested as Record<string, unknown>)
  }

  const sourceIntent = readPayloadString(payload, 'source_intent') ?? 'Create invoice'
  const contactName = readPayloadString(payload, 'contact_name')
  const projectReference = readPayloadString(payload, 'project_reference')
  const amount = readPayloadNumber(payload, 'amount')
  const currency = readPayloadString(payload, 'currency') ?? 'AUD'
  const termsDays = normalizeTermsDays(readPayloadNumber(payload, 'terms_days'))

  return {
    source_intent: sourceIntent,
    contact_name: contactName,
    project_reference: projectReference,
    amount,
    currency,
    terms_days: termsDays,
    line_items: readPayloadLineItems(payload),
  }
}

function dueDateFromTerms(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + normalizeTermsDays(days))
  return date.toISOString().slice(0, 10)
}

export function parseInvoiceIntent(text: string): InvoiceIntent {
  const source = text.trim()
  const normalized = source.replace(/\s+/g, ' ')

  let contactName: string | null = null
  let projectReference: string | null = null

  const explicitToPattern = normalized.match(/send\s+invoice\s+to\s+(.+?)\s+for\s+(.+)/i)
  const invoiceForPattern = normalized.match(/(?:invoice|bill)\s+(.+?)\s+for\s+(.+)/i)

  if (explicitToPattern) {
    contactName = explicitToPattern[1].trim()
    projectReference = explicitToPattern[2].trim()
  } else if (invoiceForPattern) {
    contactName = invoiceForPattern[1].trim()
    projectReference = invoiceForPattern[2].trim()
  } else {
    const fallbackToPattern = normalized.match(/invoice\s+to\s+(.+?)(?:\s|$)/i)
    if (fallbackToPattern) {
      contactName = fallbackToPattern[1].trim()
    }
  }

  const amountToken = normalized.match(/(?:\$|aud\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?\s*[kKmM]?)/i)
  const amount = amountToken ? parseNumericAmount(amountToken[0]) : null

  if (contactName) {
    contactName = contactName.replace(/\$\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*[kKmM]?/g, '').trim()
  }

  const termsMatch = normalized.match(/(?:net\s*)?(7|14|30)\s*-?\s*day(s)?/i)
  const termsDays = normalizeTermsDays(termsMatch ? Number(termsMatch[1]) : null)

  const cleanedProject = projectReference ? cleanProjectReference(projectReference) : ''

  return {
    source_intent: source,
    contact_name: contactName,
    project_reference: cleanedProject.length > 0 ? cleanedProject : null,
    amount,
    currency: 'AUD',
    terms_days: termsDays,
  }
}

export async function resolveInvoiceEntities(
  supabase: SupabaseClient,
  orgId: string,
  intent: InvoiceIntent,
): Promise<{ resolved: ResolvedInvoiceIntent | null; error?: string }> {
  if (!intent.contact_name) {
    return { resolved: null, error: 'missing_contact' }
  }

  let candidates = (await searchContacts(supabase, orgId, intent.contact_name)) as RankedContactMatch[]

  if (candidates.length === 0) {
    const ranked = await resolveEntityRanked(supabase, intent.contact_name, orgId)
    candidates = ranked as RankedContactMatch[]
  }

  if (candidates.length === 0) {
    return { resolved: null, error: 'unknown_contact' }
  }

  const sorted = [...candidates].sort((a, b) => (b.matchConfidence ?? 0) - (a.matchConfidence ?? 0))

  // Ambiguity detection: too many low-confidence matches
  if (sorted.length >= 3 && (sorted[0].matchConfidence ?? 0) < 0.5) {
    return { resolved: null, error: 'ambiguous_contact' }
  }

  // Ambiguity detection: top two matches have similar low confidence
  if (sorted.length >= 2) {
    const topConf = sorted[0].matchConfidence ?? 0
    const secondConf = sorted[1].matchConfidence ?? 0
    if (topConf < 0.7 && secondConf < 0.7 && Math.abs(topConf - secondConf) <= 0.1) {
      return { resolved: null, error: 'ambiguous_contact' }
    }
  }

  const best = sorted[0]

  let projectReference = intent.project_reference?.trim() ?? ''
  if (!projectReference) {
    const xref = await crossReference(supabase, orgId, 'contact', best.contact.id)
    projectReference = xref.relatedTasks[0]?.title ?? ''
  }

  let amount = intent.amount
  if (amount === null) {
    const { data: recentInvoices } = await supabase
      .from('invoices')
      .select('total, project_reference, created_at')
      .eq('org_id', orgId)
      .eq('client_contact_id', best.contact.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(5)

    const rows = (recentInvoices ?? []) as Array<{ total: number; project_reference: string | null }>
    if (projectReference) {
      const match = rows.find((row) => (row.project_reference ?? '').toLowerCase() === projectReference.toLowerCase())
      amount = typeof match?.total === 'number' ? Number(match.total) : amount
    }

    if (amount === null && rows.length > 0 && typeof rows[0].total === 'number') {
      amount = Number(rows[0].total)
    }
  }

  const normalizedCurrency = (intent.currency || 'AUD').toUpperCase()
  const normalizedTerms = normalizeTermsDays(intent.terms_days)

  const lineItems = amount && amount > 0
    ? buildLineItems(projectReference || 'Services rendered', amount, intent.line_items)
    : []

  return {
    resolved: {
      contactId: best.contact.id,
      contactName: best.contact.name,
      projectReference: projectReference || 'General services',
      amount,
      currency: normalizedCurrency,
      termsDays: normalizedTerms,
      lineItems,
    },
  }
}

export async function detectDuplicateInvoice(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  projectRef: string,
  total: number,
): Promise<DuplicateInvoiceResult> {
  const normalizedProject = projectRef.trim()
  if (!normalizedProject || !Number.isFinite(total) || total <= 0) {
    return { isDuplicate: false, existingInvoice: null }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total, project_reference, created_at')
    .eq('org_id', orgId)
    .eq('client_contact_id', contactId)
    .neq('status', 'cancelled')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return { isDuplicate: false, existingInvoice: null }
  }

  const rows = (data ?? []) as ExistingInvoiceRow[]

  // Find first invoice that fuzzy-matches on project and is within amount tolerance
  const match = rows.find((row) => {
    if (!row.project_reference) return false
    if (!fuzzyProjectMatch(normalizedProject, row.project_reference)) return false
    if (!amountWithinTolerance(total, row.total)) return false
    return true
  })

  return {
    isDuplicate: Boolean(match),
    existingInvoice: match ?? null,
  }
}

export async function generateInvoiceNumber(
  supabase: SupabaseClient,
  orgId: string,
  now = new Date(),
): Promise<string> {
  const month = now.toISOString().slice(0, 7).replace('-', '')

  const { data: org } = await supabase
    .from('organisations')
    .select('name, slug')
    .eq('id', orgId)
    .single<InvoiceNumberOrgRow>()

  const prefix = deriveOrgPrefix(org ?? null, orgId)
  const likePattern = `${prefix}-${month}-%`

  const { data: rows } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('org_id', orgId)
    .ilike('invoice_number', likePattern)
    .order('invoice_number', { ascending: false })
    .limit(200)

  let maxSequence = 0
  for (const row of (rows ?? []) as Array<{ invoice_number: string }>) {
    const match = row.invoice_number.match(/-(\d+)$/)
    if (!match) continue
    const sequence = Number(match[1])
    if (Number.isFinite(sequence) && sequence > maxSequence) {
      maxSequence = sequence
    }
  }

  const next = String(maxSequence + 1).padStart(3, '0')
  return `${prefix}-${month}-${next}`
}

async function queueInvoiceCreationApproval(
  supabase: SupabaseClient,
  orgId: string,
  agentConfigId: string,
  intent: InvoiceIntent,
): Promise<string> {
  const approval = await createApproval(supabase, {
    org_id: orgId,
    agent_config_id: agentConfigId,
    action_type: 'invoice_create',
    action_payload: {
      intent: intentToPayload(intent),
    },
    action_summary: `Create invoice for ${intent.contact_name ?? 'unknown contact'}`,
    confidence_score: 0,
    routing_decision: 'ask',
    priority: 'normal',
    context_snapshot: {
      source: 'invoice-flow',
      intent: intent.source_intent,
    },
  })

  return approval.id
}

async function queueDuplicateOverrideApproval(
  supabase: SupabaseClient,
  orgId: string,
  agentConfigId: string,
  intent: InvoiceIntent,
  existingInvoice: ExistingInvoiceRow,
): Promise<string | null> {
  const approval = await createApproval(supabase, {
    org_id: orgId,
    agent_config_id: agentConfigId,
    action_type: 'invoice_duplicate_override',
    action_payload: {
      intent: intentToPayload(intent),
      existing_invoice_id: existingInvoice.id,
      existing_invoice_number: existingInvoice.invoice_number,
    },
    action_summary: `Override duplicate guard and create invoice for ${intent.contact_name ?? 'unknown contact'}`,
    confidence_score: 0,
    routing_decision: 'ask',
    priority: 'normal',
    context_snapshot: {
      source: 'invoice-flow',
      trigger: 'duplicate_detected',
      existingInvoiceId: existingInvoice.id,
    },
  })

  return approval.id
}

export async function createInvoiceFromIntent(
  supabase: SupabaseClient,
  orgId: string,
  intentInput: InvoiceIntent,
  agentConfigId: string,
  options?: CreateInvoiceOptions,
): Promise<CreateInvoiceFromIntentResult> {
  const requireApproval = options?.requireApproval ?? true
  const allowDuplicateOverride = options?.allowDuplicateOverride ?? false

  const intent: InvoiceIntent = {
    source_intent: intentInput.source_intent,
    contact_name: intentInput.contact_name,
    project_reference: intentInput.project_reference,
    amount: intentInput.amount,
    currency: intentInput.currency || 'AUD',
    terms_days: normalizeTermsDays(intentInput.terms_days),
    line_items: intentInput.line_items,
  }

  try {
    if (requireApproval) {
      const approvalId = await queueInvoiceCreationApproval(supabase, orgId, agentConfigId, intent)
      return { status: 'queued', approvalId }
    }

    const { resolved, error } = await resolveInvoiceEntities(supabase, orgId, intent)
    if (!resolved) {
      return { status: 'error', error: error ?? 'entity_resolution_failed' }
    }

    if (!resolved.amount || resolved.amount <= 0) {
      return { status: 'error', error: 'amount_required' }
    }

    if (!allowDuplicateOverride) {
      const duplicate = await detectDuplicateInvoice(
        supabase,
        orgId,
        resolved.contactId,
        resolved.projectReference,
        resolved.amount,
      )

      if (duplicate.isDuplicate && duplicate.existingInvoice) {
        const overrideApprovalId = await queueDuplicateOverrideApproval(
          supabase,
          orgId,
          agentConfigId,
          intent,
          duplicate.existingInvoice,
        )

        return {
          status: 'duplicate',
          existingInvoiceId: duplicate.existingInvoice.id,
          existingInvoiceNumber: duplicate.existingInvoice.invoice_number,
          overrideApprovalId,
        }
      }
    }

    const invoiceNumber = await generateInvoiceNumber(supabase, orgId)

    const createResult = await createInvoice(supabase, orgId, {
      invoice_number: invoiceNumber,
      client_contact_id: resolved.contactId,
      items: resolved.lineItems,
      due_date: dueDateFromTerms(resolved.termsDays),
      currency: resolved.currency,
      project_reference: resolved.projectReference,
      source_intent: intent.source_intent,
      created_by: 'agent',
    })

    if (!createResult.success || !createResult.data?.id) {
      return { status: 'error', error: createResult.error ?? 'create_invoice_failed' }
    }

    return {
      status: 'created',
      invoiceId: createResult.data.id,
      invoiceNumber: createResult.data.invoice_number as string,
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'invoice_flow_error',
    }
  }
}

export async function runInvoiceFlowTick(
  supabase: SupabaseClient,
  orgId: string,
  agentConfigId: string,
): Promise<InvoiceFlowTickResult> {
  const result: InvoiceFlowTickResult = {
    processed: 0,
    created: 0,
    duplicatesBlocked: 0,
    sent: 0,
    overdue: 0,
    failed: 0,
  }

  try {
    const { data: createApprovals, error: createError } = await supabase
      .from('approval_queue')
      .select('id, action_payload')
      .eq('org_id', orgId)
      .eq('action_type', 'invoice_create')
      .eq('status', 'approved')

    if (createError) {
      result.failed += 1
    } else {
      for (const approval of (createApprovals ?? []) as ApprovedInvoiceRow[]) {
        result.processed += 1
        const intent = payloadToIntent(approval.action_payload)

        const outcome = await createInvoiceFromIntent(supabase, orgId, intent, agentConfigId, {
          requireApproval: false,
          allowDuplicateOverride: false,
          sourceApprovalId: approval.id,
        })

        if (outcome.status === 'created') {
          result.created += 1
          continue
        }

        if (outcome.status === 'duplicate') {
          result.duplicatesBlocked += 1
          continue
        }

        if (outcome.status === 'error') {
          result.failed += 1
        }
      }
    }

    const { data: duplicateApprovals, error: duplicateError } = await supabase
      .from('approval_queue')
      .select('id, action_payload')
      .eq('org_id', orgId)
      .eq('action_type', 'invoice_duplicate_override')
      .eq('status', 'approved')

    if (duplicateError) {
      result.failed += 1
    } else {
      for (const approval of (duplicateApprovals ?? []) as ApprovedInvoiceRow[]) {
        result.processed += 1
        const intent = payloadToIntent(approval.action_payload)

        const outcome = await createInvoiceFromIntent(supabase, orgId, intent, agentConfigId, {
          requireApproval: false,
          allowDuplicateOverride: true,
          sourceApprovalId: approval.id,
        })

        if (outcome.status === 'created') {
          result.created += 1
        } else if (outcome.status === 'error') {
          result.failed += 1
        }
      }
    }

    const sendResult = await processApprovedInvoiceSends(supabase, orgId)
    result.processed += sendResult.processed
    result.sent += sendResult.sent
    result.failed += sendResult.failed

    const overdueResult = await checkOverdueInvoices(supabase, orgId)
    result.overdue += overdueResult.overdue
    result.failed += overdueResult.failed
  } catch {
    result.failed += 1
  }

  return result
}
