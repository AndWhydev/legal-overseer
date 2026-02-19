import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('position')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tasks: data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Get user's org_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'No profile found' }, { status: 400 })

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      org_id: profile.org_id,
      title: body.title,
      description: body.description || null,
      status: body.status || 'pending',
      priority: body.priority || 'medium',
      column_id: body.column_id || null,
      position: body.position ?? 0,
      assigned_to: body.assigned_to || null,
      metadata: body.metadata || {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data }, { status: 201 })
}
