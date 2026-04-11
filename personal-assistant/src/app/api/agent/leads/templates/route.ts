import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface CreateTemplateRequest {
  name: string
  subject: string
  body: string
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
 * GET /api/agent/leads/templates
 * List all email templates
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const params = request.nextUrl.searchParams
  const category = params.get('category')

  let query = auth.supabase
    .from('email_templates')
    .select('id, name, subject, category, variables, created_at, updated_at')
    .eq('org_id', auth.orgId)

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ templates: data })
}

/**
 * POST /api/agent/leads/templates
 * Create a new email template
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  let body: CreateTemplateRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, subject, body: htmlBody, variables = [], category } = body

  if (!name || !subject || !htmlBody) {
    return NextResponse.json(
      { error: 'name, subject, and body are required' },
      { status: 400 },
    )
  }

  // Validate template variables are valid JavaScript identifiers
  if (!Array.isArray(variables)) {
    return NextResponse.json({ error: 'variables must be an array' }, { status: 400 })
  }

  const invalidVar = variables.find((v) => !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v))
  if (invalidVar) {
    return NextResponse.json(
      { error: `Invalid variable name: ${invalidVar}` },
      { status: 400 },
    )
  }

  try {
    const { data: template, error: insertError } = await auth.supabase
      .from('email_templates')
      .insert({
        org_id: auth.orgId,
        name,
        subject,
        body: htmlBody,
        variables,
        category,
      })
      .select()
      .single()

    if (insertError) {
      // Check if it's a uniqueness violation
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'Template name already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ template }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Template creation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH and DELETE handlers moved to [templateId]/route.ts
