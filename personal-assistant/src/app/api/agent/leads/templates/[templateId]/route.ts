import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface UpdateTemplateRequest {
  name?: string
  subject?: string
  body?: string
  variables?: string[]
  category?: string
}

async function getAuthContext() {
  const supabase = await createClient()
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Not configured' }, { status: 503 }) as Response }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as Response }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return { error: NextResponse.json({ error: 'No profile found' }, { status: 400 }) as Response }
  }

  return { supabase, orgId: profile.org_id }
}

/**
 * PATCH /api/agent/leads/templates/:templateId
 * Update an email template
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ templateId: string }> },
) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const { templateId } = await context.params

  if (!templateId) {
    return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
  }

  let body: UpdateTemplateRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    // Verify template belongs to org
    const { data: template, error: fetchError } = await auth.supabase
      .from('email_templates')
      .select('id')
      .eq('id', templateId)
      .eq('org_id', auth.orgId)
      .single()

    if (fetchError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Update template
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (body.name) updateData.name = body.name
    if (body.subject) updateData.subject = body.subject
    if (body.body) updateData.body = body.body
    if (body.variables) updateData.variables = body.variables
    if (body.category) updateData.category = body.category

    const { data: updated, error: updateError } = await auth.supabase
      .from('email_templates')
      .update(updateData)
      .eq('id', templateId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ template: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Template update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/agent/leads/templates/:templateId
 * Delete an email template
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ templateId: string }> },
) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const { templateId } = await context.params

  if (!templateId) {
    return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
  }

  try {
    // Verify template belongs to org
    const { data: template, error: fetchError } = await auth.supabase
      .from('email_templates')
      .select('id')
      .eq('id', templateId)
      .eq('org_id', auth.orgId)
      .single()

    if (fetchError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Delete template
    const { error: deleteError } = await auth.supabase
      .from('email_templates')
      .delete()
      .eq('id', templateId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Template deletion failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
