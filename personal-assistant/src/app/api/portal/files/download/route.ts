import { NextRequest, NextResponse } from 'next/server'
import { validatePortalRequest } from '@/lib/portal/middleware'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const path = request.nextUrl.searchParams.get('path')
  if (!path) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 })
  }

  // Verify the path belongs to this user's org+contact
  const expectedPrefix = `${auth.access.org_id}/${auth.access.contact_id}/`
  if (!path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data, error } = await supabase.storage
    .from('portal-files')
    .createSignedUrl(path, 3600) // 1 hour expiry

  if (error || !data) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl)
}
