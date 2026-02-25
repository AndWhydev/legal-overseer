import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return null
  return { supabase, orgId: profile.org_id }
}

/**
 * POST /api/agent/ai-search
 *
 * Actions based on `action` field in body:
 * - "audit" (default): run visibility audit
 * - "content": generate AI-optimized content
 * - "schema": generate schema markup
 * - "report": generate visibility report
 */
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const action = (body.action as string) ?? 'audit'

  switch (action) {
    case 'audit': {
      const { runVisibilityAudit } = await import('@/lib/agent/ai-visibility-audit')
      const result = await runVisibilityAudit(ctx.supabase, ctx.orgId, {
        domain: body.domain ?? '',
        brandName: body.brandName ?? '',
        queries: body.queries ?? [],
        location: body.location,
        competitors: body.competitors,
      })
      return NextResponse.json(result)
    }

    case 'audit-legacy': {
      const { auditVisibility } = await import('@/lib/agent/ai-search-optimizer')
      const result = await auditVisibility(ctx.supabase, ctx.orgId, body)
      return NextResponse.json(result)
    }

    case 'content': {
      const { generateOptimizedContent } = await import('@/lib/agent/ai-search-optimizer')
      const result = await generateOptimizedContent(ctx.supabase, ctx.orgId, {
        topic: body.topic ?? '',
        targetQueries: body.targetQueries ?? [],
        businessName: body.businessName,
        location: body.location,
        serviceArea: body.serviceArea,
        credentials: body.credentials,
      })
      return NextResponse.json(result)
    }

    case 'schema': {
      const { generateSchemaMarkup } = await import('@/lib/agent/ai-search-optimizer')
      const result = generateSchemaMarkup({
        schemaType: body.schemaType ?? 'LocalBusiness',
        data: body.data ?? {},
      })
      return NextResponse.json(result)
    }

    case 'report': {
      const { generateVisibilityReport } = await import('@/lib/agent/ai-search-optimizer')
      const report = await generateVisibilityReport(ctx.supabase, ctx.orgId)
      if (!report) {
        return NextResponse.json({ error: 'No audit data found. Run an audit first.' }, { status: 404 })
      }
      return NextResponse.json(report)
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}

/**
 * GET /api/agent/ai-search
 *
 * Returns latest audit results for the org.
 */
export async function GET() {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { getPreviousAudits } = await import('@/lib/agent/ai-visibility-audit')
  const audits = await getPreviousAudits(ctx.supabase, ctx.orgId, 5)

  return NextResponse.json({
    audits,
    count: audits.length,
  })
}
