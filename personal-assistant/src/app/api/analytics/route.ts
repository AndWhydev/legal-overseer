import { NextRequest, NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { calculateMRR } from '@/lib/analytics/mrr'
import { getOrgUsage } from '@/lib/analytics/usage'
import { detectChurnRisk, generateRetentionActions } from '@/lib/analytics/churn'
import { getActiveOrgId } from '@/lib/tenancy'
import { logger } from '@/lib/core/logger';

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const client = await createClient()
  if (!client) {
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }

  const { data: { user } } = await client.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const type = req.nextUrl.searchParams.get('type') ?? 'all'
  const orgId = req.nextUrl.searchParams.get('orgId')

  try {
    if (type === 'mrr' || type === 'all') {
      const mrr = await calculateMRR(client)

      if (type === 'mrr') {
        return NextResponse.json(mrr)
      }

      // For 'all', include usage and churn too
      let usage = null
      try {
        const activeOrgId = orgId || (await getActiveOrgId(client, user.id))
        if (activeOrgId) {
          usage = await getOrgUsage(client, activeOrgId)
        }
      } catch (err) {
        // Usage fetch is optional — don't fail the whole request
        logger.warn('[analytics] Failed to fetch usage:', err)
      }

      const churnRisks = await detectChurnRisk(client)
      const retentionActions = generateRetentionActions(churnRisks)

      return NextResponse.json({
        mrr,
        usage,
        churn: {
          atRiskOrgs: churnRisks.length,
          risks: churnRisks.slice(0, 10),
          actions: retentionActions.slice(0, 10),
        },
      })
    }

    if (type === 'usage') {
      if (!orgId) {
        return NextResponse.json({ error: 'orgId required for usage' }, { status: 400 })
      }
      const usage = await getOrgUsage(client, orgId)
      return NextResponse.json(usage)
    }

    if (type === 'churn') {
      const risks = await detectChurnRisk(client)
      const actions = generateRetentionActions(risks)
      return NextResponse.json({ risks, actions })
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
  } catch (err) {
    logger.error('[analytics] error:', err)
    return NextResponse.json(
      { error: 'Analytics query failed', details: String(err) },
      { status: 500 },
    )
  }
}
