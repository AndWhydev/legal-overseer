import { NextResponse } from 'next/server'
import { validateAgencyRequest } from '@/lib/portal/middleware'
import { createClient } from '@/lib/supabase/server'

/** Get portal branding for the agency's org */
export async function GET() {
  const auth = await validateAgencyRequest()
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data } = await supabase
    .from('portal_branding')
    .select('*')
    .eq('org_id', auth.orgId)
    .single()

  return NextResponse.json({ branding: data ?? null })
}

/** Update or create portal branding */
export async function PUT(request: Request) {
  const auth = await validateAgencyRequest()
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const body = await request.json()

  const brandingData = {
    org_id: auth.orgId,
    company_name: body.company_name ?? null,
    logo_url: body.logo_url ?? null,
    favicon_url: body.favicon_url ?? null,
    primary_color: body.primary_color ?? '#2563EB',
    accent_color: body.accent_color ?? '#3B82F6',
    background_color: body.background_color ?? '#FAFAFA',
    font_family: body.font_family ?? 'Inter',
    custom_css: body.custom_css ?? null,
    welcome_message: body.welcome_message ?? null,
    support_email: body.support_email ?? null,
    support_url: body.support_url ?? null,
  }

  // Upsert on org_id
  const { data, error } = await supabase
    .from('portal_branding')
    .upsert(brandingData, { onConflict: 'org_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ branding: data })
}
