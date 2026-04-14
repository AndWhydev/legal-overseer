import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { isComposioEnabled } from '@/lib/composio'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

const COMPOSIO_BASE = 'https://backend.composio.dev'

/**
 * GET /api/connections/catalog
 *
 * Returns the dynamic app catalog from Composio via raw HTTP
 * (bypasses the SDK to avoid Turbopack bundling issues on Vercel).
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

  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey || !isComposioEnabled()) {
    return NextResponse.json(
      { error: 'Composio not configured', apps: [] },
      { status: 200 },
    )
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.toLowerCase()
  const category = searchParams.get('category')?.toLowerCase()

  const headers = { 'x-api-key': apiKey, 'Content-Type': 'application/json' }

  try {
    // Fetch toolkits via raw HTTP — SDK crashes on Vercel due to Turbopack bundling
    // API returns { items: [...], next_cursor, total_pages } with snake_case fields
    const tkRes = await fetch(`${COMPOSIO_BASE}/api/v3/toolkits?limit=1000`, { headers })
    if (!tkRes.ok) {
      const body = await tkRes.text()
      throw new Error(`Composio toolkits API ${tkRes.status}: ${body.slice(0, 200)}`)
    }
    const tkData = await tkRes.json() as {
      items?: Array<{
        slug: string
        name: string
        no_auth?: boolean
        meta?: {
          description?: string
          logo?: string
          categories?: Array<{ id: string; name: string }>
        }
        auth_schemes?: string[]
      }>
    }
    const toolkits = tkData.items || []

    // Fetch connected accounts for this org
    const caRes = await fetch(
      `${COMPOSIO_BASE}/api/v3/connected-accounts?user_ids=${encodeURIComponent(ctx.orgId)}&status=ACTIVE&limit=100`,
      { headers },
    )
    let connectedSlugs = new Set<string>()
    if (caRes.ok) {
      const caData = await caRes.json() as { items?: Array<{ appName?: string; toolkit?: string }> }
      const items = caData?.items || []
      connectedSlugs = new Set(
        items.map((a: { toolkit?: string; appName?: string }) => (a.toolkit || a.appName || '').toLowerCase())
      )
    }

    let catalog = toolkits
      .filter(tk => !tk.no_auth)
      .map(tk => ({
        id: tk.slug,
        name: tk.name,
        description: tk.meta?.description || '',
        categories: (tk.meta?.categories || []).map(c => c.name || c.id),
        logo: tk.meta?.logo || '',
        authScheme: tk.auth_schemes?.[0] || 'oauth2',
        connected: connectedSlugs.has(tk.slug.toLowerCase()),
      }))

    if (category) {
      catalog = catalog.filter(app =>
        app.categories.some(c => c.toLowerCase() === category)
      )
    }

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
      { error: 'Failed to fetch catalog', detail: err instanceof Error ? err.message : String(err), apps: [] },
      { status: 500 },
    )
  }
}
