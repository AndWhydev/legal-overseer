/**
 * GET/POST /api/cron/eval-run — Cron-callable wrapper around `runEvalBatch`.
 *
 * Foundation only: the *shape* of the route lands here. The actual cron
 * schedule (vercel.json crons / Cloudflare worker / external scheduler)
 * and the candidate runner that drives the real production model both
 * land in follow-up PRs.
 *
 * Today the route accepts an optional `?mode=` query and runs a stub
 * candidate that echoes a placeholder string. That's enough to verify the
 * pipeline end-to-end without spending real Anthropic budget on a fake
 * model. A real run flips a single switch: replace `stubCandidate` with
 * a function that calls the production agent path.
 *
 * Security: gated on `CRON_SECRET` header — same pattern as the other
 * cron routes in this project. Returns 503 when the API key isn't
 * configured (so a missing env var doesn't run free evals).
 */

import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { Mode } from '@/lib/dashboard/mode-store'
import { runEvalBatch, type CandidateRunner } from '@/lib/evals/eval-runner'

const VALID_MODES: ReadonlySet<string> = new Set(['chat', 'inbox', 'work', 'money'])

/**
 * Stub candidate — echoes a deterministic placeholder. Lets us verify the
 * runner + judge wiring end-to-end without hitting a real candidate model.
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

  const client = new Anthropic()

  try {
    const report = await runEvalBatch(client, stubCandidate, {
      mode,
      candidateModel: 'stub',
    })
    return NextResponse.json(report)
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
