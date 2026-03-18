/**
 * GET /api/swarm — List swarm runs for the authenticated org
 * POST /api/swarm — Trigger a new swarm from natural language or template
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { triggerSwarm, registerBuiltinParticipants } from '@/lib/swarm'
import { logger } from '@/lib/core/logger'

let participantsRegistered = false

function ensureParticipants() {
  if (!participantsRegistered) {
    registerBuiltinParticipants()
    participantsRegistered = true
  }
}

export async function GET(request: NextRequest) {
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

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

  let query = supabase
    .from('swarm_runs')
    .select('*', { count: 'exact' })
    .eq('org_id', membership.org_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq('status', status)
  }

  const { data: runs, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ runs: runs ?? [], total: count ?? 0 })
}

export async function POST(request: NextRequest) {
  ensureParticipants()

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
  const { input, template_slug, params, auto_execute } = body

  if (!input && !template_slug) {
    return NextResponse.json({ error: 'Provide either input (natural language) or template_slug' }, { status: 400 })
  }

  try {
    if (template_slug) {
      // Direct template trigger
      const { data: template } = await supabase
        .from('swarm_templates')
        .select('*')
        .eq('slug', template_slug)
        .single()

      if (!template) {
        return NextResponse.json({ error: `Template not found: ${template_slug}` }, { status: 404 })
      }

      const { createSwarmRun, executeSwarmRun } = await import('@/lib/swarm')

      const run = await createSwarmRun(supabase, {
        orgId: membership.org_id,
        name: `${template.name}: ${params?.contact_name ?? 'Manual'}`,
        dag: template.dag,
        inputParams: params ?? {},
        templateId: template.id,
        triggeredBy: 'api',
      })

      if (auto_execute !== false) {
        executeSwarmRun(supabase, run.id).catch(err => {
          logger.error('[swarm-api] Execution failed:', err)
        })
      }

      return NextResponse.json({ run: { id: run.id, name: run.name, status: run.status } })
    }

    // Natural language trigger
    const result = await triggerSwarm(supabase, membership.org_id, input, {
      autoExecute: auto_execute !== false,
      triggeredBy: 'api',
    })

    if (!result.triggered) {
      return NextResponse.json({
        triggered: false,
        reasoning: result.matchResult.reasoning,
      })
    }

    return NextResponse.json({
      triggered: true,
      run: result.run,
      match: {
        template: result.matchResult.template?.name,
        confidence: result.matchResult.confidence,
        reasoning: result.matchResult.reasoning,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('[swarm-api] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
