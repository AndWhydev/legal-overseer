import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// GET /api/builder/preview/[projectId]
// ---------------------------------------------------------------------------
// Serves generated website HTML as a standalone page. Public access allowed
// when project status is 'preview' or 'deployed' (shareable link). Otherwise
// the requesting user must belong to the project's org.
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params

  if (!projectId) {
    return htmlError('Missing project ID', 400)
  }

  const supabase = await createClient()
  if (!supabase) {
    return htmlError('Service unavailable', 503)
  }

  // Attempt to load the project using the service-level query
  // We query without org filter first, then gate on auth below
  const { data: project, error } = await supabase
    .from('website_projects')
    .select('id, org_id, name, status, html_content, css_content')
    .eq('id', projectId)
    .single()

  if (error || !project) {
    return htmlError('Website not found', 404)
  }

  // Auth gating: public statuses allow unauthenticated access
  const publicStatuses = ['preview', 'deployed']
  const isPublic = publicStatuses.includes(project.status as string)

  if (!isPublic) {
    // Require authenticated user who belongs to the project's org
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return htmlError('Not authorized to view this project', 403)
    }

    const { data: membership } = await supabase
      .from('org_members')
      .select('id')
      .eq('org_id', project.org_id as string)
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (!membership) {
      return htmlError('Not authorized to view this project', 403)
    }
  }

  // Check for content
  if (!project.html_content) {
    return htmlError('This website is still being generated. Check back soon.', 404)
  }

  // Build final HTML -- inline CSS if separate
  let html = project.html_content as string
  if (project.css_content) {
    // Inject CSS before closing </head> or at the top
    const cssBlock = `<style>${project.css_content}</style>`
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${cssBlock}\n</head>`)
    } else {
      html = `${cssBlock}\n${html}`
    }
  }

  // Update preview_url on the project (fire and forget)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  if (appUrl) {
    const previewUrl = `${appUrl}/api/builder/preview/${projectId}`
    supabase
      .from('website_projects')
      .update({ preview_url: previewUrl })
      .eq('id', projectId)
      .then(() => {})
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function htmlError(message: string, status: number): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Error ${status}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fafafa; color: #333; }
    .error { text-align: center; max-width: 400px; padding: 2rem; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #666; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="error">
    <h1>${message}</h1>
    <p>Error ${status}</p>
  </div>
</body>
</html>`
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
