/**
 * Backfill script: populate org_connections.config.dossier_narrative
 * for every transport='composio', status='connected' row that is missing
 * it.
 *
 * Before this lands, Composio connections had no narrative in the prompt
 * — the dossier was only written to the Living Brain WAL and consumed by
 * the section librarian. Going forward, the knowledge-librarian worker
 * persists the narrative directly onto org_connections.config. For rows
 * that predate that change, run this script.
 *
 * Usage:
 *   DRY_RUN=true npx tsx --env-file=.env.local scripts/backfill-composio-dossiers.ts   # preview
 *   npx tsx --env-file=.env.local scripts/backfill-composio-dossiers.ts                # execute
 *
 * Env required (any standard .env.local / .env.prod works):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   COMPOSIO_API_KEY            (for REST tool fetch)
 *   AI_GATEWAY_API_KEY          (Vercel AI Gateway — for Gemini narrative synthesis)
 */
// Env is loaded via `node --env-file` or `tsx --env-file` at invocation.
import { createClient } from '@supabase/supabase-js'
import { buildConnectionDossier } from '../src/lib/composio/dossier'

const DRY_RUN = process.env.DRY_RUN === 'true'

interface StaleRow {
  id: string
  org_id: string
  provider: string
  connected_account_id: string
  config: Record<string, unknown>
}

async function main() {
  if (!process.env.COMPOSIO_API_KEY) {
    console.error('COMPOSIO_API_KEY missing — cannot fetch tool schemas')
    process.exit(1)
  }
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.warn('AI_GATEWAY_API_KEY missing — narratives will fall back to deterministic summaries')
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rows, error } = await supabase
    .from('org_connections')
    .select('id, org_id, provider, connected_account_id, config, transport, status')
    .eq('transport', 'composio')
    .eq('status', 'connected')
    .not('connected_account_id', 'is', null)

  if (error) {
    console.error('Failed to query org_connections:', error.message)
    process.exit(1)
  }

  const stale: StaleRow[] = (rows ?? [])
    .filter((r) => {
      const cfg = (r.config ?? {}) as Record<string, unknown>
      const narrative = cfg.dossier_narrative
      return typeof narrative !== 'string' || narrative.trim().length === 0
    })
    .map((r) => ({
      id: r.id as string,
      org_id: r.org_id as string,
      provider: r.provider as string,
      connected_account_id: r.connected_account_id as string,
      config: (r.config ?? {}) as Record<string, unknown>,
    }))

  console.log(
    `Found ${rows?.length ?? 0} connected Composio rows total, ${stale.length} missing dossier_narrative.`,
  )

  if (stale.length === 0) {
    console.log('Nothing to backfill. Exiting.')
    return
  }

  if (DRY_RUN) {
    console.log('DRY_RUN=true — previewing rows only:')
    for (const row of stale) {
      console.log(`  ${row.id} ${row.provider} ca=${row.connected_account_id} org=${row.org_id}`)
    }
    return
  }

  let ok = 0
  let failed = 0

  for (const row of stale) {
    const appKey = (row.config.composio_toolkit as string) || row.provider
    console.log(`\n[build] ${row.id} provider=${row.provider} toolkit=${appKey} ca=${row.connected_account_id}`)

    try {
      const dossier = await buildConnectionDossier({
        orgId: row.org_id,
        appKey,
        connectedAccountId: row.connected_account_id,
      })

      const mergedConfig = {
        ...row.config,
        dossier_narrative: dossier.suggestedUseCases,
        dossier_capabilities: dossier.capabilities,
        dossier_synced_at: new Date().toISOString(),
      }

      const { error: updateErr } = await supabase
        .from('org_connections')
        .update({ config: mergedConfig })
        .eq('id', row.id)

      if (updateErr) {
        console.error(`  [fail] update: ${updateErr.message}`)
        failed++
        continue
      }

      ok++
      console.log(`  [ok] ${dossier.capabilities.length} capabilities`)
      console.log(`       "${dossier.suggestedUseCases.slice(0, 120)}${dossier.suggestedUseCases.length > 120 ? '...' : ''}"`)
    } catch (err) {
      failed++
      console.error(`  [fail] ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`\nDone. ${ok} ok, ${failed} failed, ${stale.length} total.`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
