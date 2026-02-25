import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runScheduledAgents } from '@/lib/agent/scheduler'

export const maxDuration = 300 // allow up to 5 minutes for all scheduled agents
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
            console.error('[cron/scheduler] Failed to initialize Supabase client')
            return new NextResponse('Internal Server Error', { status: 500 })
        }

        // Run all scheduled agents across all orgs
        const results = await runScheduledAgents(supabase)

        console.log(`[cron/scheduler] Processed ${results.length} agent configs`)

        return NextResponse.json({
            success: true,
            message: 'Scheduler tick complete',
            agentScheduleResults: results,
        })
    } catch (err) {
        console.error('[cron/scheduler] Fatal error:', err)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
