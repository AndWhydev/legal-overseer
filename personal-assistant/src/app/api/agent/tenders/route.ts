import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return null
  return { supabase, orgId: profile.org_id as string }
}

// GET /api/agent/tenders?status=open&source=austender&min_fit=50
export async function GET(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')
  const source = searchParams.get('source')
  const minFit = searchParams.get('min_fit')

  let query = ctx.supabase
    .from('tenders')
    .select('*')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (status) query = query.eq('status', status)
  if (source) query = query.eq('source', source)
  if (minFit) query = query.gte('fit_score', Number(minFit))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

// POST /api/agent/tenders  { action: 'scan' | 'evaluate' | 'response' | 'compliance', ... }
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as Record<string, unknown>
  const action = body.action as string

  const {
    searchTenders,
    scoreTenderFit,
    generateTenderResponse,
    checkCompliance,
    extractRequirements,
  } = await import('@/lib/agent/tender-hunter')

  try {
    switch (action) {
      case 'scan': {
        const keywords = (body.keywords as string[]) ?? []
        const region = body.region as string | undefined
        const minValue = body.minValue as number | undefined
        const results = await searchTenders(ctx.supabase, ctx.orgId, { keywords, region, minValue })
        return NextResponse.json(results)
      }

      case 'evaluate': {
        const tenderId = body.tenderId as string
        if (!tenderId) return NextResponse.json({ error: 'tenderId required' }, { status: 400 })
        const result = await scoreTenderFit(ctx.supabase, ctx.orgId, tenderId)
        return NextResponse.json(result)
      }

      case 'response': {
        const tenderId = body.tenderId as string
        if (!tenderId) return NextResponse.json({ error: 'tenderId required' }, { status: 400 })
        const result = await generateTenderResponse(ctx.supabase, ctx.orgId, tenderId)
        return NextResponse.json(result)
      }

      case 'compliance': {
        const tenderId = body.tenderId as string
        if (!tenderId) return NextResponse.json({ error: 'tenderId required' }, { status: 400 })
        const result = await checkCompliance(ctx.supabase, ctx.orgId, tenderId)
        return NextResponse.json(result)
      }

      case 'extract-requirements': {
        const tenderId = body.tenderId as string
        if (!tenderId) return NextResponse.json({ error: 'tenderId required' }, { status: 400 })
        const result = await extractRequirements(ctx.supabase, ctx.orgId, tenderId)
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
