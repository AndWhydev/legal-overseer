import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { getToolkitAuthScheme, isComposioEnabled } from '@/lib/composio'
import type { AuthSchemeResponse } from '@/lib/connections/catalog-types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connections/composio/scheme/[appKey]
 *
 * Returns the primary auth scheme definition for a toolkit so the BYOK
 * credentials dialog knows which fields to render (API key, client_id,
 * client_secret, etc.).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appKey: string }> },
) {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>
  try {
    ctx = await getAuthContext(request)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isComposioEnabled()) {
    return NextResponse.json({ error: 'Composio not configured' }, { status: 503 })
  }

  const { appKey } = await params
  if (!appKey) {
    return NextResponse.json({ error: 'appKey required' }, { status: 400 })
  }

  const scheme = await getToolkitAuthScheme(appKey)
  if (!scheme) {
    return NextResponse.json({ error: `No auth scheme found for "${appKey}"` }, { status: 404 })
  }

  const response: AuthSchemeResponse = {
    appKey,
    mode: scheme.mode,
    fields: scheme.fields.map((f) => ({
      name: f.name,
      displayName: f.displayName || f.name,
      type: (f.type === 'number' || f.type === 'boolean' ? f.type : 'string') as
        | 'string'
        | 'number'
        | 'boolean',
      description: f.description || '',
      required: f.required ?? true,
    })),
    authGuideUrl: scheme.authGuideUrl,
  }

  return NextResponse.json(response)
}
