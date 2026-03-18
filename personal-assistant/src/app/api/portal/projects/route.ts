import { NextRequest, NextResponse } from 'next/server'
<<<<<<< HEAD
import { getPortalContext } from '@/lib/portal/auth'
import { getPortalProjects } from '@/lib/portal/data'

/**
 * GET /api/portal/projects?slug=org-slug
 * Returns projects visible to the portal user.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  const ctx = await getPortalContext(slug)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!ctx.access.permissions.view_projects) {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  const projects = await getPortalProjects(ctx)
=======
import { validatePortalRequest } from '@/lib/portal/middleware'
import { getPortalProjects, getPortalProjectWithTasks } from '@/lib/portal/data'

export async function GET(request: NextRequest) {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const projectId = request.nextUrl.searchParams.get('id')

  // If a specific project ID is requested, return project + tasks
  if (projectId) {
    const result = await getPortalProjectWithTasks(projectId)
    if (!result.project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    // Verify the project belongs to this client
    if (result.project.org_id !== auth.access.org_id || result.project.contact_id !== auth.access.contact_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ project: result.project, tasks: result.tasks })
  }

  const projects = await getPortalProjects(auth.access.org_id, auth.access.contact_id)
>>>>>>> v1.5-marketing-launch
  return NextResponse.json({ projects })
}
