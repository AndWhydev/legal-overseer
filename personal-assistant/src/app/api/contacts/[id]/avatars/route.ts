import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Channel priority map — lower number = higher priority
const CHANNEL_PRIORITY: Record<string, number> = {
  manual: 10,
  google: 20,
  gmail: 20,
  whatsapp: 30,
  instagram: 40,
  linkedin: 50,
  facebook: 60,
  slack: 70,
  telegram: 80,
}

/** GET /api/contacts/[id]/avatars — list all channel avatars for a contact */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data, error } = await supabase
    .from('contact_avatars')
    .select('*')
    .eq('contact_id', id)
    .order('priority', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ avatars: data })
}

/** POST /api/contacts/[id]/avatars — upsert a channel avatar */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const channel = body.channel as string
  const avatar_url = body.avatar_url as string

  if (!channel || !avatar_url) {
    return NextResponse.json({ error: 'channel and avatar_url are required' }, { status: 400 })
  }

  const priority = CHANNEL_PRIORITY[channel] ?? 50

  const { data, error } = await supabase
    .from('contact_avatars')
    .upsert(
      { contact_id: id, channel, avatar_url, priority, fetched_at: new Date().toISOString() },
      { onConflict: 'contact_id,channel' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ avatar: data })
}
