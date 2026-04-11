import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createUploadUrl } from '@/lib/attachments/attachment-service'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    // Auth
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

    // Parse body
    const body = await request.json()
    const { filename, mimeType, size, threadId } = body as {
      filename: string
      mimeType: string
      size: number
      threadId?: string
    }

    if (!filename || !mimeType || !size) {
      return NextResponse.json(
        { error: 'Missing required fields: filename, mimeType, size' },
        { status: 400 },
      )
    }

    // Create signed upload URL + DB record
    const result = await createUploadUrl(supabase, {
      orgId: profile.org_id,
      userId: user.id,
      threadId: threadId || null,
      filename,
      mimeType,
      size,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'

    // Validation errors (from validateFile) return 400
    if (
      message.includes('exceeds') ||
      message.includes('not allowed') ||
      message.includes('blocked')
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
