import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

export interface InvoiceTemplate {
  logo_base64?: string
  primary_color?: string
  accent_color?: string
  footer_text?: string
  terms?: string
}

const ALLOWED_COLORS = /^#[0-9A-Fa-f]{3,6}$/

function sanitizeTemplate(raw: unknown): InvoiceTemplate {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, unknown>

  const out: InvoiceTemplate = {}

  if (typeof src.logo_base64 === 'string' && src.logo_base64.startsWith('data:image/')) {
    // Limit logo size to ~500 KB base64
    if (src.logo_base64.length <= 700_000) {
      out.logo_base64 = src.logo_base64
    }
  }

  if (typeof src.primary_color === 'string' && ALLOWED_COLORS.test(src.primary_color)) {
    out.primary_color = src.primary_color
  }

  if (typeof src.accent_color === 'string' && ALLOWED_COLORS.test(src.accent_color)) {
    out.accent_color = src.accent_color
  }

  if (typeof src.footer_text === 'string') {
    out.footer_text = src.footer_text.slice(0, 500)
  }

  if (typeof src.terms === 'string') {
    out.terms = src.terms.slice(0, 5000)
  }

  return out
}

async function resolveOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase!
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .single()
  return data?.org_id ?? null
}

// GET — load org's invoice template config
export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await resolveOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'Organization not found' }, { status: 400 })

  const { data: org, error } = await supabase
    .from('organizations')
    .select('invoice_template')
    .eq('id', orgId)
    .single()

  if (error) {
    logger.error('[invoices/template] GET error', { error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ template: org?.invoice_template ?? {} })
}

// PUT — save org's invoice template config
export async function PUT(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await resolveOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'Organization not found' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const template = sanitizeTemplate(body)

  const { data, error } = await supabase
    .from('organizations')
    .update({ invoice_template: template })
    .eq('id', orgId)
    .select('invoice_template')
    .single()

  if (error) {
    logger.error('[invoices/template] PUT error', { error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ template: data?.invoice_template ?? template })
}
