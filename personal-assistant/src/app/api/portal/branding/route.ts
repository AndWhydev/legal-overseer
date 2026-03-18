<<<<<<< HEAD
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/portal/branding?slug=org-slug
 * Returns branding for a portal. Public — no auth required (needed for login page).
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
=======
import { NextResponse } from 'next/server'
import { validateAgencyRequest } from '@/lib/portal/middleware'
import { createClient } from '@/lib/supabase/server'

/** Get portal branding for the agency's org */
export async function GET() {
  const auth = await validateAgencyRequest()
  if (!auth.ok) return auth.response
>>>>>>> v1.5-marketing-launch

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

<<<<<<< HEAD
  // Get org by slug (public info)
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: branding } = await supabase
    .from('portal_branding')
    .select('logo_url, favicon_url, primary_color, secondary_color, font_family, company_name, tagline, footer_text')
    .eq('org_id', org.id)
    .single()

  return NextResponse.json({
    org_name: org.name,
    branding: branding || {
      primary_color: '#2563eb',
      secondary_color: '#1e40af',
      font_family: 'Inter',
      company_name: org.name,
    },
  })
}

/**
 * PUT /api/portal/branding — Agency staff updates portal branding
 */
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const body = await request.json()

  const { data, error } = await supabase
    .from('portal_branding')
    .upsert({
      org_id: profile.org_id,
      logo_url: body.logo_url,
      favicon_url: body.favicon_url,
      primary_color: body.primary_color || '#2563eb',
      secondary_color: body.secondary_color || '#1e40af',
      font_family: body.font_family || 'Inter',
      company_name: body.company_name,
      tagline: body.tagline,
      custom_domain: body.custom_domain,
      custom_css: body.custom_css,
      footer_text: body.footer_text,
    }, { onConflict: 'org_id' })
=======
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
>>>>>>> v1.5-marketing-launch
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ branding: data })
}
