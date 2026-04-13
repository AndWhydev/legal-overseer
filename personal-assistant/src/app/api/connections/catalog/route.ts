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
    // Composio SDK v0.6.x: use toolkits.getToolkits({}) — NOT composio.apps.list()
    // Returns array of toolkit objects with { slug, name, meta: { logo, categories, description }, authSchemes }
    const toolkits = await composio.toolkits.getToolkits({})

    // Get user's connected accounts to mark which are connected
    const connectedAccounts = await composio.connectedAccounts.list({
      user_ids: [ctx.orgId],
      status: 'ACTIVE',
    })

    const connectedApps = new Set(
      (Array.isArray(connectedAccounts) ? connectedAccounts : connectedAccounts?.items || [])
        .map((a: { appName?: string; toolkit?: string }) => (a.toolkit || a.appName || '').toLowerCase())
    )

    let catalog = toolkits
      .filter((tk: { noAuth?: boolean }) => !tk.noAuth) // exclude no-auth toolkits (internal utilities)
      .map((tk: {
        slug: string
        name: string
        meta?: {
          description?: string
          logo?: string
          categories?: Array<{ slug: string; name: string }>
        }
        authSchemes?: string[]
      }) => ({
        id: tk.slug,
        name: tk.name,
        description: tk.meta?.description || '',
        categories: (tk.meta?.categories || []).map(c => c.name || c.slug),
        logo: tk.meta?.logo || '',
        authScheme: tk.authSchemes?.[0] || 'oauth2',
        connected: connectedApps.has(tk.slug.toLowerCase()),
      }))

    // Apply category filter
    if (category) {
      catalog = catalog.filter((app: { categories: string[] }) =>
        app.categories.some((c: string) => c.toLowerCase() === category)
      )
    }

    // Apply search filter
    if (query) {
      catalog = catalog.filter((app: { name: string; description: string; id: string }) =>
        app.name.toLowerCase().includes(query) ||
        app.description.toLowerCase().includes(query) ||
        app.id.toLowerCase().includes(query)
      )
    }

    return NextResponse.json({
      apps: catalog,
      total: catalog.length,
      connected_count: catalog.filter((a: { connected: boolean }) => a.connected).length,
    })
  } catch (err) {
    logger.error('[catalog] Failed to fetch app catalog', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return NextResponse.json(
      { error: 'Failed to fetch catalog', apps: [] },
      { status: 500 },
    )
  }
}
