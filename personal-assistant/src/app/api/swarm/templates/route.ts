import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SwarmCoordinator } from '@/lib/swarm'
import type { SwarmDefinition, SwarmGovernance } from '@/lib/swarm'

/**
 * GET /api/swarm/templates
 *
 * List available swarm templates for the current organization.
 */
export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'No profile found' }, { status: 400 })

  const coordinator = new SwarmCoordinator(supabase, profile.org_id)
  const templates = await coordinator.listTemplates()

  return NextResponse.json({ templates })
}

/**
 * POST /api/swarm/templates
 *
 * Create a custom swarm template.
 *
 * Body:
 * - name: string
 * - slug: string
 * - description?: string
 * - category?: string
 * - triggerPatterns?: string[]
 * - definition: SwarmDefinition
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'No profile found' }, { status: 400 })

  const body = await request.json()
  const { name, slug, description, category, triggerPatterns, definition } = body

  if (!name || !slug || !definition) {
    return NextResponse.json(
      { error: 'name, slug, and definition are required' },
      { status: 400 },
    )
  }

  // Validate definition has required fields
  const def = definition as SwarmDefinition
  if (!def.version || !def.steps || !Array.isArray(def.steps) || def.steps.length === 0) {
    return NextResponse.json(
      { error: 'definition must have version, steps (non-empty array)' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('swarm_templates')
    .insert({
      org_id: profile.org_id,
      name,
      slug,
      description: description || null,
      category: category || 'custom',
      trigger_patterns: triggerPatterns || [],
      definition,
      governance: def.governance || {},
      is_builtin: false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ template: data }, { status: 201 })
}
