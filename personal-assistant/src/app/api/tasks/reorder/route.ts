import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  const body = await request.json()
  const { updates } = body as {
    updates: Array<{ id: string; column_id: string; position: number }>
  }

  if (!updates?.length) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  const promises = updates.map(({ id, column_id, position }) =>
    supabase.from('tasks').update({ column_id, position }).eq('id', id).eq('org_id', orgId)
  )
  const results = await Promise.all(promises)

  const errors = results.filter(r => r.error)
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0].error!.message }, { status: 500 })
  }

  return NextResponse.json({ updated: updates.length })
}
