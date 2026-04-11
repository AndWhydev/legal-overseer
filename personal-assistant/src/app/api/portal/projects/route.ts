import { NextRequest, NextResponse } from 'next/server'
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
  return NextResponse.json({ projects })
}
