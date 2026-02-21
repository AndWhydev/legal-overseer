import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { expireStaleApprovals } from '../../../../../lib/agent/approval-queue'
import { sendDailyDigest } from '../../../../../lib/agent/approval-notifier'

const DEFAULT_ORG_ID = '289083e9-2143-44eb-9b6a-cfc615f1e81c'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.SCHEDULER_SECRET
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const digestSent = await sendDailyDigest(supabase, DEFAULT_ORG_ID)
  const expired = await expireStaleApprovals(supabase, DEFAULT_ORG_ID)

  return NextResponse.json({ digestSent, expired })
}
