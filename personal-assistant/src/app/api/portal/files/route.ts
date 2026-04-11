import { NextRequest, NextResponse } from 'next/server'
import { validatePortalRequest } from '@/lib/portal/middleware'
import { getPortalFiles, createPortalFile } from '@/lib/portal/data'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const projectId = request.nextUrl.searchParams.get('project_id') ?? undefined
  const files = await getPortalFiles(auth.access.org_id, auth.access.contact_id, projectId)
  return NextResponse.json({ files })
}

export async function POST(request: NextRequest) {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const projectId = formData.get('project_id') as string | null
  const description = formData.get('description') as string | null
  const category = formData.get('category') as string | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Validate file size (max 50MB)
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
  }

  const storagePath = `${auth.access.org_id}/${auth.access.contact_id}/${Date.now()}-${file.name}`

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('portal-files')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // Create file record
  const portalFile = await createPortalFile({
    org_id: auth.access.org_id,
    contact_id: auth.access.contact_id,
    project_id: projectId,
    uploaded_by: auth.userId,
    uploaded_by_role: 'client',
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    storage_path: storagePath,
    description,
    category: (category as 'general') ?? 'general',
  })

  if (!portalFile) {
    return NextResponse.json({ error: 'Failed to create file record' }, { status: 500 })
  }

  return NextResponse.json({ file: portalFile }, { status: 201 })
}
