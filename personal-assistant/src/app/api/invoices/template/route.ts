import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeTemplate } from '@/lib/invoices/template-types'
import type { InvoiceTemplate } from '@/lib/invoices/template-types'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

// Re-export for consumers that import from this route file
export type { InvoiceTemplate }

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
