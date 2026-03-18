<<<<<<< HEAD
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateDigest } from '@/lib/revenue/digest'
import { resolveOrgId } from '@/lib/revenue/resolve-org'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const resolved = await resolveOrgId(supabase)
    if (!resolved) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const periodType = (req.nextUrl.searchParams.get('period') ?? 'weekly') as 'weekly' | 'monthly'

    const { data, error } = await supabase
      .from('revenue_digests')
      .select('*')
      .eq('org_id', resolved.orgId)
      .eq('period_type', periodType)
      .order('period_start', { ascending: false })
      .limit(12)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ digests: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const resolved = await resolveOrgId(supabase)
    if (!resolved) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const periodType = (body.period_type ?? 'weekly') as 'weekly' | 'monthly'

    const digest = await generateDigest(supabase, resolved.orgId, periodType)

    return NextResponse.json({ digest })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Digest generation failed' },
      { status: 500 },
    )
=======
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { generateWeeklyDigest, formatDigestText } from '@/lib/revenue/weekly-digest'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/revenue/digest
 * Generate and return the current weekly revenue digest.
 * Query params: ?format=text — return plain text instead of JSON
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  try {
    const url = new URL(request.url)
    const format = url.searchParams.get('format')

    const digest = await generateWeeklyDigest(supabase, orgId)
    if (!digest) {
      return NextResponse.json({ error: 'Failed to generate digest' }, { status: 500 })
    }

    if (format === 'text') {
      const text = formatDigestText(digest)
      return new NextResponse(text, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    return NextResponse.json(digest)
  } catch (error) {
    logger.error('[api/revenue/digest] Error:', error)
    return NextResponse.json({ error: 'Failed to generate digest' }, { status: 500 })
>>>>>>> v1.5-marketing-launch
  }
}
