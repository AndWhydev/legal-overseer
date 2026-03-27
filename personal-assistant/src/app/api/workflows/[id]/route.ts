import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'
import { parseWorkflowRule } from '@/lib/workflows/workflow-rule-parser'

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
 * GET /api/workflows/[id]
 * Fetch a single workflow rule by ID (org-scoped via RLS).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveUserOrg()
    if ('error' in auth && !('supabase' in auth)) return auth.error

    const { supabase } = auth as {
      supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>
      user: { id: string }
      orgId: string
    }

    const { id } = await params

    const { data: rule, error } = await supabase
      .from('workflow_rules')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !rule) {
      return NextResponse.json({ error: 'Workflow rule not found' }, { status: 404 })
    }

    return NextResponse.json({ rule })
  } catch (err) {
    logger.error('GET /api/workflows/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/workflows/[id]
 * Update a workflow rule. Supports toggle (enabled) and re-parse (description).
 * Body: { enabled?: boolean, name?: string, description?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveUserOrg()
    if ('error' in auth && !('supabase' in auth)) return auth.error

    const { supabase } = auth as {
      supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>
      user: { id: string }
      orgId: string
    }

    const { id } = await params
    const body = await request.json() as Record<string, unknown>

    // Build update payload
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (typeof body.enabled === 'boolean') {
      update.enabled = body.enabled
    }

    if (typeof body.name === 'string') {
      update.name = body.name
    }

    // If description changed, re-parse the natural language
    if (typeof body.description === 'string') {
      update.description = body.description

      const parseResult = await parseWorkflowRule(body.description, {
        roles: [],
        tools: [],
      })

      if (parseResult.rule.trigger) {
        update.trigger_type = parseResult.rule.trigger.type
        update.trigger_config = parseResult.rule.trigger
      }
      if (parseResult.rule.conditions) {
        update.conditions = parseResult.rule.conditions
      }
      if (parseResult.rule.actions) {
        update.actions = parseResult.rule.actions
      }
    }

    const { data: rule, error } = await supabase
      .from('workflow_rules')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error || !rule) {
      logger.error('PATCH /api/workflows/[id] update error:', error)
      return NextResponse.json({ error: 'Failed to update workflow rule' }, { status: 500 })
    }

    return NextResponse.json({ rule })
  } catch (err) {
    logger.error('PATCH /api/workflows/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/workflows/[id]
 * Delete a workflow rule and cancel any linked active workflows.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveUserOrg()
    if ('error' in auth && !('supabase' in auth)) return auth.error

    const { supabase } = auth as {
      supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>
      user: { id: string }
      orgId: string
    }

    const { id } = await params

    // Cancel any active workflows linked to this rule
    await supabase
      .from('role_workflows')
      .update({ status: 'cancelled' })
      .eq('workflow_rule_id', id)
      .in('status', ['pending', 'running', 'waiting'])

    // Delete the workflow rule
    const { error } = await supabase
      .from('workflow_rules')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('DELETE /api/workflows/[id] error:', error)
      return NextResponse.json({ error: 'Failed to delete workflow rule' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('DELETE /api/workflows/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
