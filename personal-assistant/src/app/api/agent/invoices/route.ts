import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createInvoiceFromIntent, parseInvoiceIntent, type InvoiceIntent } from '@/lib/agent/invoice-flow'
import { searchInvoices, type InvoiceStatus, type InvoiceLineItem } from '@/lib/agent/shared-tools'

const ALLOWED_STATUSES = new Set<InvoiceStatus>(['draft', 'sent', 'viewed', 'overdue', 'paid', 'cancelled'])

interface CreateInvoiceBody {
  command?: string
  contact_name?: string
  project_reference?: string
  amount?: number
  currency?: string
  terms_days?: number
  line_items?: InvoiceLineItem[]
  agent_config_id?: string
}

interface InvoiceListRow extends Record<string, unknown> {
  id: string
  client_contact_id?: string | null
}

async function getAuthContext() {
  const supabase = await createClient()
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Not configured' }, { status: 503 }) as Response }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as Response }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return { error: NextResponse.json({ error: 'No profile found' }, { status: 400 }) as Response }
  }

  return { supabase, orgId: profile.org_id }
}

async function resolveInvoiceAgentConfigId(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  orgId: string,
  preferredAgentConfigId?: string,
): Promise<string | null> {
  if (preferredAgentConfigId) {
    const { data } = await supabase
      .from('agent_configs')
      .select('id')
      .eq('org_id', orgId)
      .eq('id', preferredAgentConfigId)
      .eq('agent_type', 'invoice-flow')
      .single<{ id: string }>()

    if (data?.id) return data.id
  }

  const { data } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('org_id', orgId)
    .eq('agent_type', 'invoice-flow')
    .limit(1)

  const first = (data ?? [])[0] as { id: string } | undefined
  return first?.id ?? null
}

function normalizeIntentFromBody(body: CreateInvoiceBody): InvoiceIntent {
  if (typeof body.command === 'string' && body.command.trim().length > 0) {
    const parsed = parseInvoiceIntent(body.command)
    return {
      ...parsed,
      amount: typeof body.amount === 'number' ? body.amount : parsed.amount,
      currency: typeof body.currency === 'string' && body.currency.trim().length > 0 ? body.currency : parsed.currency,
      terms_days: typeof body.terms_days === 'number' ? body.terms_days : parsed.terms_days,
      line_items: Array.isArray(body.line_items) ? body.line_items : parsed.line_items,
    }
  }

  return {
    source_intent: body.command?.trim() || 'Create invoice',
    contact_name: typeof body.contact_name === 'string' ? body.contact_name.trim() || null : null,
    project_reference: typeof body.project_reference === 'string' ? body.project_reference.trim() || null : null,
    amount: typeof body.amount === 'number' ? body.amount : null,
    currency: typeof body.currency === 'string' && body.currency.trim().length > 0 ? body.currency.trim().toUpperCase() : 'AUD',
    terms_days: typeof body.terms_days === 'number' ? body.terms_days : 14,
    line_items: Array.isArray(body.line_items) ? body.line_items : undefined,
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const statusParam = request.nextUrl.searchParams.get('status')
  const contactId = request.nextUrl.searchParams.get('client_contact_id')

  let statusFilter: InvoiceStatus | undefined
  if (statusParam) {
    if (!ALLOWED_STATUSES.has(statusParam as InvoiceStatus)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    }
    statusFilter = statusParam as InvoiceStatus
  }

  const result = await searchInvoices(auth.supabase, auth.orgId, {
    status: statusFilter,
    client_contact_id: contactId ?? undefined,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'Failed to load invoices' }, { status: 500 })
  }

  const rows = (result.data?.results ?? []) as InvoiceListRow[]
  const contactIds = Array.from(new Set(rows
    .map((row) => row.client_contact_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)))

  let contactById = new Map<string, string>()
  if (contactIds.length > 0) {
    const { data: contacts } = await auth.supabase
      .from('contacts')
      .select('id, name')
      .eq('org_id', auth.orgId)
      .in('id', contactIds)

    contactById = new Map((contacts ?? []).map((row) => [String(row.id), String(row.name)]))
  }

  const invoices = rows.map((row) => ({
    ...row,
    client_name:
      typeof row.client_contact_id === 'string'
        ? (contactById.get(row.client_contact_id) ?? null)
        : null,
  }))

  return NextResponse.json({ invoices })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  let body: CreateInvoiceBody
  try {
    body = (await request.json()) as CreateInvoiceBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const intent = normalizeIntentFromBody(body)
  if (!intent.contact_name) {
    return NextResponse.json({ error: 'contact_name or command with contact is required' }, { status: 400 })
  }

  const agentConfigId = await resolveInvoiceAgentConfigId(auth.supabase, auth.orgId, body.agent_config_id)
  if (!agentConfigId) {
    return NextResponse.json({ error: 'invoice-flow agent config not found' }, { status: 400 })
  }

  const outcome = await createInvoiceFromIntent(auth.supabase, auth.orgId, intent, agentConfigId, {
    requireApproval: true,
  })

  if (outcome.status === 'queued') {
    return NextResponse.json({
      queued: true,
      approvalId: outcome.approvalId,
      action_type: 'invoice_create',
    }, { status: 202 })
  }

  if (outcome.status === 'error') {
    return NextResponse.json({ error: outcome.error }, { status: 400 })
  }

  return NextResponse.json({ queued: false, outcome })
}
