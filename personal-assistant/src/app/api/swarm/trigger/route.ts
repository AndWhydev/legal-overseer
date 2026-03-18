import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SwarmCoordinator } from '@/lib/swarm'

/**
 * POST /api/swarm/trigger
 *
 * Trigger a swarm execution from natural language or explicit template.
 *
 * Body:
 * - input: string (natural language command)
 * - templateSlug?: string (explicit template selection)
 * - params?: Record<string, unknown> (pre-filled parameters)
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
  const { input, templateSlug, params } = body

  if (!input && !templateSlug) {
    return NextResponse.json(
      { error: 'Either "input" (natural language) or "templateSlug" is required' },
      { status: 400 },
    )
  }

  try {
    const coordinator = new SwarmCoordinator(supabase, profile.org_id)

    const result = await coordinator.trigger(input || `Execute ${templateSlug}`, {
      templateSlug,
      params,
      triggerType: 'api',
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
