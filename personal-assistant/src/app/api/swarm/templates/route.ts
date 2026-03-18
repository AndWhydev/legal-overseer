/**
 * GET /api/swarm/templates — List available swarm templates
 * POST /api/swarm/templates — Create a custom swarm template
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) return NextResponse.json({ error: 'No org membership' }, { status: 403 })

  const { data: templates, error } = await supabase
    .from('swarm_templates')
    .select('*')
    .or(`org_id.is.null,org_id.eq.${membership.org_id}`)
    .order('usage_count', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ templates: templates ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) return NextResponse.json({ error: 'No org membership' }, { status: 403 })

  const body = await request.json()
  const { name, slug, description, category, dag, param_schema, trigger_patterns } = body

  if (!name || !slug || !dag) {
    return NextResponse.json({ error: 'name, slug, and dag are required' }, { status: 400 })
  }

  const { data: template, error } = await supabase
    .from('swarm_templates')
    .insert({
      slug,
      name,
      description: description ?? null,
      category: category ?? 'custom',
      dag,
      param_schema: param_schema ?? {},
      trigger_patterns: trigger_patterns ?? [],
      is_builtin: false,
      org_id: membership.org_id,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ template }, { status: 201 })
}
