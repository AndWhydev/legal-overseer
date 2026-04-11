import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { messageId, feedback } = await request.json()
  if (!messageId || !['up', 'down'].includes(feedback)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Store feedback — fire and forget, non-critical
  try {
    await supabase
      .from('conversation_messages')
      .update({ feedback })
      .eq('id', messageId)
  } catch {
    // Silently fail — non-critical
  }

  return NextResponse.json({ ok: true })
}
