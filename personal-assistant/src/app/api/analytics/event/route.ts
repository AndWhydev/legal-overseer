import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ ok: true })
    }

    const { data: { user } } = await supabase.auth.getUser()
    const body = await request.json()

    const { error } = await supabase.from('analytics_events').insert({
      user_id: user?.id,
      event_name: body.event,
      metadata: body.metadata || {},
      created_at: body.timestamp || new Date().toISOString(),
    })

    if (error) {
      logger.info('[analytics] Event logged (table insert failed)', { event: body.event })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
