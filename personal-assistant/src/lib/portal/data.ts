import { createClient } from '@/lib/supabase/server'
import type { PortalContext, PortalProject, PortalInvoice, PortalFile, PortalRequest } from './types'

/**
 * All data access functions require a validated PortalContext.
 * RLS policies enforce scoping, but we also filter explicitly for defense-in-depth.
 */

export async function getPortalProjects(ctx: PortalContext): Promise<PortalProject[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('projects')
    .select('id, name, description, status, metadata, started_at, completed_at, created_at')
    .eq('org_id', ctx.org.id)
    .eq('contact_id', ctx.contact.id)
    .order('created_at', { ascending: false })

  return (data || []) as PortalProject[]
}

export async function getPortalInvoices(ctx: PortalContext): Promise<PortalInvoice[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, items, subtotal, tax, total, currency, issued_date, due_date, paid_date, pdf_url, created_at')
    .eq('org_id', ctx.org.id)
    .eq('client_contact_id', ctx.contact.id)
    .order('created_at', { ascending: false })

  return (data || []) as PortalInvoice[]
}

export async function getPortalFiles(ctx: PortalContext): Promise<PortalFile[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('portal_files')
    .select('*')
    .eq('org_id', ctx.org.id)
    .eq('contact_id', ctx.contact.id)
    .order('created_at', { ascending: false })

  return (data || []) as PortalFile[]
}

export async function getPortalRequests(ctx: PortalContext): Promise<PortalRequest[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('portal_requests')
    .select('*')
    .eq('org_id', ctx.org.id)
    .eq('contact_id', ctx.contact.id)
    .order('created_at', { ascending: false })

  return (data || []) as PortalRequest[]
}

export async function createPortalRequest(
  ctx: PortalContext,
  input: {
    title: string
    description?: string
    type: 'change_request' | 'bug_report' | 'question' | 'feedback'
    priority?: 'low' | 'medium' | 'high' | 'urgent'
    project_id?: string
  }
): Promise<PortalRequest | null> {
  const supabase = await createClient()
  if (!supabase) return null

  // Create the portal request
  const { data: request, error } = await supabase
    .from('portal_requests')
    .insert({
      org_id: ctx.org.id,
      contact_id: ctx.contact.id,
      project_id: input.project_id || null,
      type: input.type,
      title: input.title,
      description: input.description || null,
      priority: input.priority || 'medium',
    })
    .select()
    .single()

  if (error || !request) return null

  // Also create a kanban task linked to this request
  const { data: task } = await supabase
    .from('tasks')
    .insert({
      org_id: ctx.org.id,
      title: `[Portal] ${input.title}`,
      description: input.description || null,
      status: 'pending',
      priority: input.priority || 'medium',
      metadata: {
        source: 'portal',
        contact_id: ctx.contact.id,
        contact_name: ctx.contact.name,
        portal_request_id: request.id,
        request_type: input.type,
        project_id: input.project_id || null,
      },
    })
    .select('id')
    .single()

  // Link task back to request
  if (task) {
    await supabase
      .from('portal_requests')
      .update({ task_id: task.id })
      .eq('id', request.id)
  }

  return request as PortalRequest
}

export async function uploadPortalFile(
  ctx: PortalContext,
  file: File,
  projectId?: string
): Promise<PortalFile | null> {
  const supabase = await createClient()
  if (!supabase) return null

  if (!ctx.access.permissions.upload_files) return null

  const storagePath = `${ctx.org.id}/${ctx.contact.id}/${projectId || 'general'}/${Date.now()}-${file.name}`

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('portal-files')
    .upload(storagePath, file)

  if (uploadError) return null

  // Create file record
  const { data } = await supabase
    .from('portal_files')
    .insert({
      org_id: ctx.org.id,
      contact_id: ctx.contact.id,
      project_id: projectId || null,
      uploaded_by_portal: true,
      uploaded_by_user_id: ctx.access.user_id,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
      storage_path: storagePath,
    })
    .select()
    .single()

  return data as PortalFile | null
}
