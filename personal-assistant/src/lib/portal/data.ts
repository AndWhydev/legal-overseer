import { createClient } from '@/lib/supabase/server'
import type {
  PortalProject,
  PortalProjectTask,
  PortalFile,
  PortalRequest,
  PortalActivity,
  PortalNotification,
  PortalInvoice,
} from './types'

// ─── Projects ────────────────────────────────────────────────────────────────

export async function getPortalProjects(orgId: string, contactId: string): Promise<PortalProject[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('portal_projects')
    .select('*')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })

  return (data ?? []) as PortalProject[]
}

export async function getPortalProjectWithTasks(projectId: string): Promise<{
  project: PortalProject | null
  tasks: (PortalProjectTask & { task_title: string; task_status: string })[]
}> {
  const supabase = await createClient()
  if (!supabase) return { project: null, tasks: [] }

  const { data: project } = await supabase
    .from('portal_projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (!project) return { project: null, tasks: [] }

  const { data: taskLinks } = await supabase
    .from('portal_project_tasks')
    .select('*, tasks(title, status)')
    .eq('portal_project_id', projectId)
    .eq('visible_to_client', true)
    .order('position')

  const tasks = (taskLinks ?? []).map((link: Record<string, unknown>) => ({
    ...(link as unknown as PortalProjectTask),
    task_title: (link.tasks as { title: string } | null)?.title ?? '',
    task_status: (link.tasks as { status: string } | null)?.status ?? 'pending',
  }))

  return { project: project as PortalProject, tasks }
}

// ─── Invoices ────────────────────────────────────────────────────────────────

export async function getPortalInvoices(orgId: string, contactId: string): Promise<PortalInvoice[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total, subtotal, tax, currency, issued_date, due_date, paid_date, pdf_url, items, created_at')
    .eq('org_id', orgId)
    .eq('client_contact_id', contactId)
    .in('status', ['sent', 'viewed', 'overdue', 'paid'])
    .order('created_at', { ascending: false })

  return (data ?? []) as PortalInvoice[]
}

// ─── Files ───────────────────────────────────────────────────────────────────

export async function getPortalFiles(orgId: string, contactId: string, projectId?: string): Promise<PortalFile[]> {
  const supabase = await createClient()
  if (!supabase) return []

  let query = supabase
    .from('portal_files')
    .select('*')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data } = await query
  return (data ?? []) as PortalFile[]
}

export async function createPortalFile(file: Omit<PortalFile, 'id' | 'created_at'>): Promise<PortalFile | null> {
  const supabase = await createClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('portal_files')
    .insert(file)
    .select()
    .single()

  if (error) return null
  return data as PortalFile
}

// ─── Requests ────────────────────────────────────────────────────────────────

export async function getPortalRequests(orgId: string, contactId: string): Promise<PortalRequest[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('portal_requests')
    .select('*')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })

  return (data ?? []) as PortalRequest[]
}

export async function createPortalRequest(request: {
  org_id: string
  contact_id: string
  submitted_by: string
  title: string
  description?: string
  request_type?: string
  priority?: string
}): Promise<{ request: PortalRequest | null; error?: string }> {
  const supabase = await createClient()
  if (!supabase) return { request: null, error: 'Not configured' }

  // Insert the request
  const { data: portalRequest, error: reqError } = await supabase
    .from('portal_requests')
    .insert({
      org_id: request.org_id,
      contact_id: request.contact_id,
      submitted_by: request.submitted_by,
      title: request.title,
      description: request.description ?? null,
      request_type: request.request_type ?? 'general',
      priority: request.priority ?? 'medium',
    })
    .select()
    .single()

  if (reqError) return { request: null, error: reqError.message }

  // Create a task in the kanban for the agency
  const { data: task } = await supabase
    .from('tasks')
    .insert({
      org_id: request.org_id,
      title: `[Portal] ${request.title}`,
      description: request.description ?? null,
      status: 'pending',
      priority: request.priority ?? 'medium',
      metadata: {
        source: 'portal',
        contact_id: request.contact_id,
        portal_request_id: (portalRequest as PortalRequest).id,
        request_type: request.request_type ?? 'general',
      },
    })
    .select('id')
    .single()

  // Link task to request
  if (task) {
    await supabase
      .from('portal_requests')
      .update({ task_id: (task as { id: string }).id })
      .eq('id', (portalRequest as PortalRequest).id)
  }

  // Log activity
  await supabase
    .from('portal_activity')
    .insert({
      org_id: request.org_id,
      contact_id: request.contact_id,
      activity_type: 'request_submitted',
      title: `New request: ${request.title}`,
      description: request.description ?? null,
    })

  return { request: portalRequest as PortalRequest }
}

// ─── Activity ────────────────────────────────────────────────────────────────

export async function getPortalActivity(
  orgId: string,
  contactId: string,
  options?: { limit?: number; offset?: number }
): Promise<PortalActivity[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0

  const { data } = await supabase
    .from('portal_activity')
    .select('*')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  return (data ?? []) as PortalActivity[]
}

export async function markActivityRead(activityIds: string[]): Promise<void> {
  const supabase = await createClient()
  if (!supabase) return

  await supabase
    .from('portal_activity')
    .update({ read: true })
    .in('id', activityIds)
}

// ─── Notifications ───────────────────────────────────────────────────────────

export async function getPortalNotifications(accessId: string): Promise<PortalNotification[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('portal_notifications')
    .select('*')
    .eq('portal_access_id', accessId)
    .order('created_at', { ascending: false })
    .limit(50)

  return (data ?? []) as PortalNotification[]
}

export async function getUnreadNotificationCount(accessId: string): Promise<number> {
  const supabase = await createClient()
  if (!supabase) return 0

  const { count } = await supabase
    .from('portal_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('portal_access_id', accessId)
    .eq('read', false)

  return count ?? 0
}

export async function markNotificationsRead(notificationIds: string[]): Promise<void> {
  const supabase = await createClient()
  if (!supabase) return

  await supabase
    .from('portal_notifications')
    .update({ read: true })
    .in('id', notificationIds)
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

export interface PortalDashboardStats {
  activeProjects: number
  pendingInvoices: number
  totalOwed: number
  openRequests: number
  unreadNotifications: number
}

export async function getPortalDashboardStats(
  orgId: string,
  contactId: string,
  accessId: string
): Promise<PortalDashboardStats> {
  const supabase = await createClient()
  if (!supabase) {
    return { activeProjects: 0, pendingInvoices: 0, totalOwed: 0, openRequests: 0, unreadNotifications: 0 }
  }

  const [projectsRes, invoicesRes, requestsRes, notifRes] = await Promise.all([
    supabase
      .from('portal_projects')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('contact_id', contactId)
      .in('status', ['planning', 'active', 'on_hold']),
    supabase
      .from('invoices')
      .select('total')
      .eq('org_id', orgId)
      .eq('client_contact_id', contactId)
      .in('status', ['sent', 'viewed', 'overdue']),
    supabase
      .from('portal_requests')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('contact_id', contactId)
      .in('status', ['submitted', 'reviewed', 'in_progress']),
    supabase
      .from('portal_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('portal_access_id', accessId)
      .eq('read', false),
  ])

  const pendingInvoices = invoicesRes.data ?? []
  const totalOwed = pendingInvoices.reduce((sum, inv) => sum + Number((inv as { total: number }).total ?? 0), 0)

  return {
    activeProjects: projectsRes.count ?? 0,
    pendingInvoices: pendingInvoices.length,
    totalOwed,
    openRequests: requestsRes.count ?? 0,
    unreadNotifications: notifRes.count ?? 0,
  }
}
