import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'
import { parseWorkflowRule } from '@/lib/workflows/workflow-rule-parser'
import type { WorkflowRule } from '@/lib/workflows/workflow-rule-types'

/**
 * Resolve the authenticated user and their org_id.
 */
async function resolveUserOrg() {
  const supabase = await createClient()
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Service not configured' }, { status: 503 }) }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    return { error: NextResponse.json({ error: 'No organization found' }, { status: 404 }) }
  }

  return { supabase, user, orgId: profile.org_id as string }
}

/**
 * GET /api/workflows
 * Returns all workflow rules for the authenticated user's org.
 */
export async function GET() {
  try {
    const auth = await resolveUserOrg()
    if ('error' in auth && !('supabase' in auth)) return auth.error

    const { supabase, orgId } = auth as {
      supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>
      user: { id: string }
      orgId: string
    }

    const { data: rules, error } = await supabase
      .from('workflow_rules')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('GET /api/workflows query error:', error)
      return NextResponse.json({ error: 'Failed to fetch workflow rules' }, { status: 500 })
    }

    return NextResponse.json({ rules: (rules ?? []) as WorkflowRule[] })
  } catch (err) {
    logger.error('GET /api/workflows error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/workflows
 * Create a new workflow rule from natural language description.
 * Body: { description: string, name?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await resolveUserOrg()
    if ('error' in auth && !('supabase' in auth)) return auth.error

    const { supabase, user, orgId } = auth as {
      supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>
      user: { id: string }
      orgId: string
    }

    const body = await request.json() as Record<string, unknown>
    const { description, name } = body

    if (!description || typeof description !== 'string') {
      return NextResponse.json(
        { error: 'description is required and must be a string' },
        { status: 400 },
      )
    }

    // Parse natural language into structured rule
    const parseResult = await parseWorkflowRule(description, {
      roles: [],
      tools: [],
    })

    const ruleName = (name as string) || parseResult.rule.name || description.slice(0, 50)

    // If needs review, return the parsed rule as draft without inserting
    if (parseResult.needsReview) {
      return NextResponse.json({
        rule: {
          ...parseResult.rule,
          name: ruleName,
          description,
        },
        confidence: parseResult.confidence,
        needsReview: true,
      }, { status: 200 })
    }

    // Insert into workflow_rules table
    const { data: rule, error } = await supabase
      .from('workflow_rules')
      .insert({
        org_id: orgId,
        created_by: user.id,
        name: ruleName,
        description,
        trigger_type: parseResult.rule.trigger?.type ?? 'event',
        trigger_config: parseResult.rule.trigger ?? {},
        conditions: parseResult.rule.conditions ?? [],
        actions: parseResult.rule.actions ?? [],
        enabled: true,
      })
      .select()
      .single()

    if (error) {
      logger.error('POST /api/workflows insert error:', error)
      return NextResponse.json({ error: 'Failed to create workflow rule' }, { status: 500 })
    }

    return NextResponse.json({
      rule,
      confidence: parseResult.confidence,
      needsReview: false,
    }, { status: 201 })
  } catch (err) {
    logger.error('POST /api/workflows error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
