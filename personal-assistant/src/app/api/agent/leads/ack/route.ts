import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { withCronGuard } from '@/lib/cron/cron-guard'
import { processPendingLeadAcks } from '@/lib/agent/lead-acknowledgment'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.SCHEDULER_SECRET
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return withCronGuard(request, async (supabase) => {
    // Get all active organizations
    const { data: orgs, error: orgError } = await supabase
      .from('organisations')
      .select('id')

    if (orgError) {
      throw new Error(`Failed to fetch organizations: ${orgError.message}`)
    }

    const results: Record<string, unknown>[] = []

    for (const org of orgs ?? []) {
      const orgId = org.id
      try {
        const ackResult = await processPendingLeadAcks(supabase, orgId)
        results.push({ orgId, ackResult })
      } catch (orgErr) {
        console.error(`[cron/leads/ack] Failed processing for org ${orgId}:`, orgErr)
        results.push({
          orgId,
          error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
        })
      }
    }

    return {
      message: `Lead ack processing complete for ${orgs?.length ?? 0} orgs`,
      details: { results },
    }
  })
}
