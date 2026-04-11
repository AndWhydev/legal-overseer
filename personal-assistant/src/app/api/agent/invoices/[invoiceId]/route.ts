import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isValidInvoiceStatusTransition, queueInvoiceSend } from '@/lib/agent/invoice-sender'
import { updateInvoice, type InvoiceStatus } from '@/lib/agent/shared-tools'

const UPDATABLE_STATUSES = new Set<InvoiceStatus>(['sent', 'paid', 'cancelled'])

interface PatchInvoiceBody {
  status?: string
  payment_method?: string
  paid_date?: string
  agent_config_id?: string
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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const { invoiceId } = await context.params
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('invoices')
    .select('*')
    .eq('org_id', auth.orgId)
    .eq('id', invoiceId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  return NextResponse.json({ invoice: data })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const { invoiceId } = await context.params
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
  }

  let body: PatchInvoiceBody
  try {
    body = (await request.json()) as PatchInvoiceBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const nextStatus = typeof body.status === 'string' ? body.status : ''
  if (!UPDATABLE_STATUSES.has(nextStatus as InvoiceStatus)) {
    return NextResponse.json({ error: 'status must be sent, paid, or cancelled' }, { status: 400 })
  }

  const { data: current, error: currentError } = await auth.supabase
    .from('invoices')
    .select('id, status')
    .eq('org_id', auth.orgId)
    .eq('id', invoiceId)
    .single<{ id: string; status: InvoiceStatus }>()

  if (currentError || !current) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  if (!isValidInvoiceStatusTransition(current.status, nextStatus as InvoiceStatus)) {
    return NextResponse.json({ error: `invalid transition from ${current.status} to ${nextStatus}` }, { status: 409 })
  }

  if (nextStatus === 'sent') {
    const agentConfigId = await resolveInvoiceAgentConfigId(auth.supabase, auth.orgId, body.agent_config_id)
    if (!agentConfigId) {
      return NextResponse.json({ error: 'invoice-flow agent config not found' }, { status: 400 })
    }

    const queueResult = await queueInvoiceSend(auth.supabase, auth.orgId, invoiceId, agentConfigId)
    if (!queueResult.queued) {
      return NextResponse.json({ error: queueResult.error ?? 'Failed to queue invoice send' }, { status: 400 })
    }

    return NextResponse.json({
      queued: true,
      approvalId: queueResult.approvalId,
      action_type: 'invoice_send',
    }, { status: 202 })
  }

  const result = await updateInvoice(auth.supabase, auth.orgId, invoiceId, {
    status: nextStatus as InvoiceStatus,
    payment_method: body.payment_method,
    paid_date:
      nextStatus === 'paid'
        ? (typeof body.paid_date === 'string' && body.paid_date.trim().length > 0
            ? body.paid_date
            : new Date().toISOString().slice(0, 10))
        : undefined,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'Failed to update invoice' }, { status: 500 })
  }

  return NextResponse.json({ invoice: result.data })
}
