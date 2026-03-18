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
  }
}
