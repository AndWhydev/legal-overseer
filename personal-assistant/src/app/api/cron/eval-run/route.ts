/**
 * GET/POST /api/cron/eval-run — Cron-callable wrapper around `runEvalBatch`.
 *
 * Schedule: weekly Sunday 07:00 UTC (vercel.json #114).
 *
 * Candidate selection (default → real, opt-in stub):
 *   - default → makeProductionCandidate (calls Claude with mode-shaped
 *     persona + per-purpose model from #94, #100, #111, #112, #113)
 *   - ?candidate=stub → deterministic echo, useful for pipeline smoke-test
 *     when you don't want to spend Anthropic budget
 *
 * Security: gated on `CRON_SECRET` header — same pattern as the other
 * cron routes in this project. Returns 503 when the API key isn't
 * configured (so a missing env var doesn't run free evals).
 */

import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { Mode } from '@/lib/dashboard/mode-store'
import { createClient } from '@/lib/supabase/server'
import {
  persistEvalRun,
  runEvalBatch,
  type CandidateRunner,
} from '@/lib/evals/eval-runner'
import {
  makeProductionCandidate,
  PRODUCTION_CANDIDATE_LABEL,
} from '@/lib/evals/production-candidate'

const VALID_MODES: ReadonlySet<string> = new Set(['chat', 'inbox', 'work', 'money'])

/**
 * Stub candidate — echoes a deterministic placeholder. Available via
 * `?candidate=stub` for pipeline smoke-tests without spending Anthropic
 * budget on a real run.
 */
const stubCandidate: CandidateRunner = (evalCase) =>
  `[stub candidate response] case=${evalCase.id} mode=${evalCase.mode}`

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? req.headers.get('x-cron-secret') ?? ''
  // Accept "Bearer <secret>" or the bare secret.
  const token = header.startsWith('Bearer ') ? header.slice(7) : header
  return token === secret
}

function parseMode(value: string | null): Mode | undefined {
  if (!value) return undefined
  if (!VALID_MODES.has(value)) return undefined
  return value as Mode
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  const url = new URL(req.url)
  const mode = parseMode(url.searchParams.get('mode'))
  const useStub = url.searchParams.get('candidate') === 'stub'

  const client = new Anthropic()
  const candidate = useStub ? stubCandidate : makeProductionCandidate(client)
  const candidateLabel = useStub ? 'stub' : PRODUCTION_CANDIDATE_LABEL

  try {
    const report = await runEvalBatch(client, candidate, {
      mode,
      candidateModel: candidateLabel,
    })

    // Persist to Supabase. Best-effort: errors land in the response body
    // alongside the report, the route still returns 200. The report itself
    // is the source of truth — DB is a trend-analysis side channel.
    let persistOutcome: Awaited<ReturnType<typeof persistEvalRun>> | { skipped: true } = {
      skipped: true,
    }
    const supabase = await createClient()
    if (supabase) {
      persistOutcome = await persistEvalRun(supabase, report, {
        mode: mode ?? null,
        candidateModel: candidateLabel,
        metadata: { source: 'cron/eval-run', candidate: candidateLabel },
      })
    }

    return NextResponse.json({ report, persist: persistOutcome })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
