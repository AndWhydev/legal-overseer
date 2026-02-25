import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runTriage } from '@/lib/agent/channel-triage'

export const maxDuration = 300 // allow up to 5 minutes for triage
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    // Validate cron secret if deployed
    if (
        process.env.CRON_SECRET &&
        request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`
    ) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    try {
        const supabase = await createClient()
        if (!supabase) {
            console.error('[cron/triage] Failed to initialize Supabase client')
            return new NextResponse('Internal Server Error', { status: 500 })
        }

        // 1. Get all active organizations
        const { data: orgs, error: orgError } = await supabase
            .from('organizations')
            .select('id')

        if (orgError) {
            console.error('[cron/triage] Failed to fetch organizations', orgError)
            return new NextResponse('Database Error', { status: 500 })
        }

        if (!orgs || orgs.length === 0) {
            return NextResponse.json({ success: true, message: 'No organizations to process', results: [] })
        }

        const results: Record<string, unknown>[] = []

        // 2. Process triage for each org
        for (const org of orgs) {
            const orgId = org.id

            try {
                // Run triage
                const triageResult = await runTriage(supabase, orgId)

                const summary = `triage processed=${triageResult.processed} actionable=${triageResult.actionable} informational=${triageResult.informational} spam=${triageResult.spam} routed=${triageResult.routed.length}`
                console.log(`[cron/triage] org=${orgId}: ${summary}`)

                // Log to activity feed
                await supabase
                    .from('activity_feed')
                    .insert({
                        org_id: orgId,
                        action_type: 'system',
                        action: 'channel_triage',
                        result: summary,
                    })
                    .then(({ error: logErr }) => {
                        if (logErr) console.error(`[cron/triage] Failed to log activity for org ${orgId}:`, logErr.message)
                    })

                results.push({
                    orgId,
                    triage: triageResult,
                })
            } catch (orgErr) {
                console.error(`[cron/triage] Failed processing triage for org ${orgId}:`, orgErr)
                results.push({
                    orgId,
                    error: orgErr instanceof Error ? orgErr.message : 'unknown_error',
                })
            }
        }

        return NextResponse.json({ success: true, message: 'Triage processing complete', results })
    } catch (err) {
        console.error('[cron/triage] Fatal error:', err)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
