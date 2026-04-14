/**
 * Backfill script: revoke any orphaned Composio connected accounts
 * left behind by the pre-refactor soft-delete path.
 *
 * Before the ConnectorLifecycle refactor, DELETE /api/connections/[id]
 * merely set status='disabled' and never called disconnectAccount().
 * That means every row with transport='composio' AND status='disabled'
 * *might* still have an ACTIVE connected account in Composio. This
 * script iterates those rows and calls disconnectAccount() best-effort
 * so the user's Composio dashboard matches their BitBit state.
 *
 * Usage:
 *   DRY_RUN=true npx tsx scripts/backfill-composio-orphans.ts   # preview
 *   npx tsx scripts/backfill-composio-orphans.ts                # execute
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { disconnectAccount, isComposioEnabled } from '../src/lib/composio'

const DRY_RUN = process.env.DRY_RUN === 'true'
const BATCH_SIZE = 100
const MAX_ITERATIONS = 200 // safety cap: 20k rows

interface OrphanRow {
  id: string
  org_id: string
  provider: string
  connected_account_id: string | null
  config: Record<string, unknown>
}

async function main() {
  if (!isComposioEnabled()) {
    console.error('COMPOSIO_API_KEY missing — cannot proceed')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log(`[orphan-backfill] mode=${DRY_RUN ? 'DRY_RUN' : 'EXECUTE'}`)

  let processed = 0
  let revoked = 0
  let failed = 0
  let skipped = 0

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { data, error } = await supabase
      .from('org_connections')
      .select('id, org_id, provider, connected_account_id, config')
      .eq('transport', 'composio')
      .eq('status', 'disabled')
      .range(i * BATCH_SIZE, i * BATCH_SIZE + BATCH_SIZE - 1)
      .returns<OrphanRow[]>()

    if (error) {
      console.error('[orphan-backfill] query failed:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break

    for (const row of data) {
      processed++
      const accountId =
        row.connected_account_id ??
        (row.config as Record<string, string | undefined>)?.composio_connected_account_id
      if (!accountId) {
        skipped++
        continue
      }

      if (DRY_RUN) {
        console.log(`[dry-run] would disconnect ${row.provider} org=${row.org_id} acc=${accountId}`)
        continue
      }

      try {
        const ok = await disconnectAccount(accountId)
        if (ok) {
          revoked++
          console.log(`[revoked] org=${row.org_id} provider=${row.provider} acc=${accountId}`)
        } else {
          failed++
        }
      } catch (err) {
        failed++
        console.error(`[fail] org=${row.org_id} acc=${accountId}:`, err instanceof Error ? err.message : String(err))
      }

      // Be gentle on Composio's API.
      await new Promise((r) => setTimeout(r, 100))
    }

    if (data.length < BATCH_SIZE) break
  }

  console.log(`[orphan-backfill] done — processed=${processed} revoked=${revoked} skipped=${skipped} failed=${failed}`)
}

main().catch((err) => {
  console.error('[orphan-backfill] fatal:', err)
  process.exit(1)
})
