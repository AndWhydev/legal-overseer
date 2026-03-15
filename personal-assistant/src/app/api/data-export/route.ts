import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get user's org_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'No profile found' }, { status: 400 })

  const orgId = profile.org_id as string

  // Rate limiting: max 1 export per hour per org
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: recentExports } = await supabase
    .from('soft_delete_requests')
    .select('id')
    .eq('org_id', orgId)
    .gte('created_at', oneHourAgo)
    .limit(1)

  if ((recentExports?.length ?? 0) > 0) {
    logger.warn('Data export rate limit exceeded', { org_id: orgId, user_id: user.id })
    return NextResponse.json(
      { error: 'Too many export requests. Maximum 1 per hour.' },
      { status: 429 }
    )
  }

  try {
    // Fetch all user data
    const [contacts, tasks, messages, memories, sessions, integrations] = await Promise.all([
      supabase.from('contacts').select('*').eq('org_id', orgId),
      supabase.from('tasks').select('*').eq('org_id', orgId),
      supabase.from('channel_messages').select('*').eq('org_id', orgId).order('received_at', { ascending: false }).limit(1000),
      supabase.from('memory_entries').select('*').eq('org_id', orgId),
      supabase.from('agent_sessions').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(100),
      supabase.from('user_integrations').select('provider,status,connected_at,settings').eq('org_id', orgId),
    ])

    const errors = [contacts.error, tasks.error, messages.error, memories.error, sessions.error, integrations.error].filter(Boolean)
    if (errors.length > 0) {
      logger.error('Data export query failed', { org_id: orgId, errors: errors.map(e => e?.message) })
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 })
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      org_id: orgId,
      user_id: user.id,
      data: {
        contacts: contacts.data || [],
        tasks: tasks.data || [],
        channel_messages: messages.data || [],
        memory_entries: memories.data || [],
        agent_sessions: sessions.data || [],
        user_integrations: integrations.data || [],
      },
    }

    const json = JSON.stringify(exportData, null, 2)
    const filename = `bitbit-export-${orgId}-${new Date().toISOString().split('T')[0]}.json`

    logger.info('Data export completed', {
      org_id: orgId,
      user_id: user.id,
      size_bytes: Buffer.byteLength(json),
      items_count: Object.values(exportData.data).reduce((sum, arr) => sum + ((arr as any[]).length || 0), 0),
    })

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    logger.error('Data export error', {
      org_id: orgId,
      user_id: user.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
