import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { confirmUpload, getDownloadUrl } from '@/lib/attachments/attachment-service'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PATCH /api/attachments/[id]
 * Confirm an upload is complete (marks attachment as 'ready').
 */
export async function PATCH(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single<{ org_id: string }>()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No profile found' }, { status: 400 })
    }

    const attachment = await confirmUpload(supabase, id, profile.org_id)

    return NextResponse.json(attachment)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Confirm failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/attachments/[id]
 * Get a signed download URL for a ready attachment.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single<{ org_id: string }>()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No profile found' }, { status: 400 })
    }

    const { signedUrl, attachment } = await getDownloadUrl(supabase, id, profile.org_id)

    return NextResponse.json({
      signedUrl,
      filename: attachment.filename,
      mimeType: attachment.mime_type,
      size: attachment.size,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
