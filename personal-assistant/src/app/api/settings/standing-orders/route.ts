import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'
import {
  getActiveOrders,
  createOrder,
  deactivateOrder,
  type OrderCategory,
} from '@/lib/intelligence/standing-orders'

const VALID_CATEGORIES: OrderCategory[] = ['triage', 'communication', 'financial', 'scheduling', 'general']

/**
 * Resolve the authenticated user and their org_id.
 */
async function resolveUserOrg() {
  const supabase = await createClient()
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Service not configured' }, { status: 503 }) }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    return { error: NextResponse.json({ error: 'No organization found' }, { status: 404 }) }
  }

  return { supabase, user, orgId: profile.org_id as string }
}

/**
 * GET /api/settings/standing-orders
 * Returns all active standing orders for the user's org.
 */
export async function GET() {
  try {
    const auth = await resolveUserOrg()
    if ('error' in auth && !('supabase' in auth)) return auth.error

    const { supabase, orgId } = auth as { supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>; user: { id: string }; orgId: string }
    const orders = await getActiveOrders(supabase, orgId)

    return NextResponse.json({ orders })
  } catch (err) {
    logger.error('GET /api/settings/standing-orders error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/settings/standing-orders
 * Creates a new standing order.
 * Body: { directive: string, category: OrderCategory, conditions?: object, priority?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await resolveUserOrg()
    if ('error' in auth && !('supabase' in auth)) return auth.error

    const { supabase, user, orgId } = auth as { supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>; user: { id: string }; orgId: string }

    const body = await request.json() as Record<string, unknown>
    const { directive, category, conditions, priority } = body

    if (!directive || typeof directive !== 'string') {
      return NextResponse.json({ error: 'directive is required and must be a string' }, { status: 400 })
    }

    if (!category || !VALID_CATEGORIES.includes(category as OrderCategory)) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 },
      )
    }

    const order = await createOrder(
      supabase,
      orgId,
      user.id,
      directive,
      category as OrderCategory,
      conditions as Record<string, unknown> | undefined,
      typeof priority === 'number' ? priority : undefined,
    )

    if (!order) {
      return NextResponse.json({ error: 'Failed to create standing order' }, { status: 500 })
    }

    return NextResponse.json({ order }, { status: 201 })
  } catch (err) {
    logger.error('POST /api/settings/standing-orders error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/settings/standing-orders?id=<uuid>
 * Soft-deactivates a standing order.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await resolveUserOrg()
    if ('error' in auth && !('supabase' in auth)) return auth.error

    const { supabase } = auth as { supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>; user: { id: string }; orgId: string }

    const url = new URL(request.url)
    const orderId = url.searchParams.get('id')

    if (!orderId) {
      return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 })
    }

    const success = await deactivateOrder(supabase, orderId)
    if (!success) {
      return NextResponse.json({ error: 'Failed to deactivate standing order' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('DELETE /api/settings/standing-orders error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
