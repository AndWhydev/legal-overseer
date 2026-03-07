import { NextRequest, NextResponse } from 'next/server'
import { withCronGuard } from '@/lib/cron/cron-guard'
import { expireStaleApprovals } from '../../../../../lib/agent/approval-queue'
import { sendDailyDigest } from '../../../../../lib/agent/approval-notifier'

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
        const digestSent = await sendDailyDigest(supabase, orgId)
        const expired = await expireStaleApprovals(supabase, orgId)
        results.push({ orgId, digestSent, expired })
      } catch (orgErr) {
        console.error(`[cron/approvals/digest] Failed processing for org ${orgId}:`, orgErr)
        results.push({
          orgId,
          error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
        })
      }
    }

    return {
      message: `Approval digest processing complete for ${orgs?.length ?? 0} orgs`,
      details: { results },
    }
  })
}
