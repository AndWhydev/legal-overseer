import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { getComposioClient, isComposioEnabled } from '@/lib/composio'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connections/catalog
 *
 * Returns the dynamic app catalog from Composio.
 * Users can browse and search available integrations.
 *
 * Query params:
 *   - q: search query (optional)
 *   - category: filter by category (optional)
 */
export async function GET(request: NextRequest) {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>
  try {
    ctx = await getAuthContext(request)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isComposioEnabled()) {
    return NextResponse.json(
      { error: 'Composio not configured', apps: [] },
      { status: 200 },
    )
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.toLowerCase()
  const category = searchParams.get('category')?.toLowerCase()

  const composio = getComposioClient()
  if (!composio) {
    return NextResponse.json({ error: 'Composio client unavailable', apps: [] })
  }

  try {
    // Fetch available apps from Composio
    const apps = await (composio as unknown as {
      apps: {
        list: (params?: { category?: string }) => Promise<{
          items: Array<{
            key: string
            name: string
            description?: string
            categories?: string[]
            logo?: string
            auth_schemes?: string[]
          }>
        }>
      }
    }).apps.list(category ? { category } : undefined)

    // Get user's connected accounts to mark which are connected
    const connectedAccounts = await (composio as unknown as {
      connectedAccounts: {
        list: (params: { userIds: string[]; statuses: string[] }) => Promise<{
          items: Array<{ id: string; appName?: string; status: string }>
        }>
      }
    }).connectedAccounts.list({
      userIds: [ctx.orgId],
      statuses: ['ACTIVE'],
    })

    const connectedApps = new Set(
      connectedAccounts.items.map(a => (a.appName || '').toLowerCase())
    )

    let catalog = apps.items.map(app => ({
      id: app.key,
      name: app.name,
      description: app.description || '',
      categories: app.categories || [],
      logo: app.logo || '',
      authScheme: app.auth_schemes?.[0] || 'oauth2',
      connected: connectedApps.has(app.key.toLowerCase()),
    }))

    // Apply search filter
    if (query) {
      catalog = catalog.filter(app =>
        app.name.toLowerCase().includes(query) ||
        app.description.toLowerCase().includes(query) ||
        app.id.toLowerCase().includes(query)
      )
    }

    return NextResponse.json({
      apps: catalog,
      total: catalog.length,
      connected_count: catalog.filter(a => a.connected).length,
    })
  } catch (err) {
    logger.error('[catalog] Failed to fetch app catalog', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Failed to fetch catalog', apps: [] },
      { status: 500 },
    )
  }
}
