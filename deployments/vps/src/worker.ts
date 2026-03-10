import { createClient } from '@supabase/supabase-js'

const WORKER_TYPE = process.env.WORKER_TYPE || 'cron'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const POLL_INTERVAL_MS = 5000

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function pollAndExecute() {
  const { data: tasks, error } = await supabase
    .from('agent_runs')
    .select('id, org_id, agent_type, input, status')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5)

  if (error) {
    console.error('[worker] Poll error:', error.message)
    return
  }

  for (const task of tasks ?? []) {
    try {
      await supabase.from('agent_runs').update({ status: 'running' }).eq('id', task.id)

      const WORKER_URL = process.env.WORKER_CALLBACK_URL || 'https://bitbit-workers.fly.dev'
      const res = await fetch(`${WORKER_URL}/api/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.WORKER_AUTH_TOKEN}`,
        },
        body: JSON.stringify({ runId: task.id, orgId: task.org_id, agentType: task.agent_type }),
      })

      if (!res.ok) {
        console.error(`[worker] Dispatch failed for ${task.id}: ${res.status}`)
        await supabase.from('agent_runs').update({ status: 'error' }).eq('id', task.id)
      }
    } catch (err) {
      console.error(`[worker] Error processing ${task.id}:`, err)
      await supabase.from('agent_runs').update({ status: 'error' }).eq('id', task.id)
    }
  }
}

async function main() {
  console.log(`[worker] Starting ${WORKER_TYPE} worker...`)

  if (WORKER_TYPE === 'cron') {
    const tick = async () => {
      await pollAndExecute()
      setTimeout(tick, POLL_INTERVAL_MS)
    }
    tick()
  }

  const { startHealthServer } = await import('./health')
  startHealthServer()
}

main().catch(err => {
  console.error('[worker] Fatal error:', err)
  process.exit(1)
})
