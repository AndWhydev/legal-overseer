import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveEntityRanked } from '@/lib/context/entity-resolver'
import { writeTaskEvent } from '@/lib/context/timeline-writer'
import { linkTaskToContact } from '@/lib/context/relationship-linker'
import type { Contact } from '@/lib/types'

// Types defined locally (mirrors @bitbit/core — no path alias configured)
export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled'

export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface ChannelMessage {
  id: string
  channel: string
  direction: 'inbound' | 'outbound'
  sender: string
  recipient?: string
  subject?: string
  body: string
  timestamp: string
  is_actionable: boolean
  priority: 'critical' | 'high' | 'medium' | 'low'
  contact_id?: string
  metadata: Record<string, unknown>
}

// --- Shared Result Types ---

export interface CrudResult<T> {
  success: boolean
  data?: T
  error?: string
}

export type TaskResult = CrudResult<{ id: string; title: string; [key: string]: unknown }>
export type InvoiceResult = CrudResult<{
  id: string
  invoice_number: string
  status: InvoiceStatus
  total: number
  [key: string]: unknown
}>
export type SearchResult<T> = CrudResult<{ results: T[]; total: number }>

export interface ContactMatch {
  contact: Contact
  matchConfidence: number
  matchStep: string
}

// --- Internal Helpers ---

async function resolveColumnId(supabase: SupabaseClient, orgId: string, columnName: string): Promise<string | null> {
  const { data } = await supabase
    .from('kanban_columns')
    .select('id')
    .eq('org_id', orgId)
    .ilike('title', columnName)
    .limit(1)
    .single()
  return data?.id ?? null
}

// --- Task CRUD ---

export async function createTask(
  supabase: SupabaseClient,
  orgId: string,
  params: {
    title: string
    description?: string
    priority?: string
    column?: string
    contact_id?: string
    tags?: string[]
  }
): Promise<TaskResult> {
  let columnId: string | undefined
  if (params.column) {
    columnId = (await resolveColumnId(supabase, orgId, params.column)) ?? undefined
  }
  if (!columnId) {
    columnId = (await resolveColumnId(supabase, orgId, 'To Do')) ?? undefined
  }

  // Get next position in column
  const { count } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('column_id', columnId!)

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      org_id: orgId,
      title: params.title,
      description: params.description || null,
      priority: params.priority || 'medium',
      column_id: columnId,
      position: count ?? 0,
      metadata: params.tags ? { tags: params.tags } : {},
    })
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  // Fire-and-forget: timeline event
  writeTaskEvent(supabase, orgId, data.id, 'task_created', {
    title: params.title,
    column: params.column,
    priority: params.priority || 'medium',
  })

  // Fire-and-forget: link contact
  if (params.contact_id) {
    linkTaskToContact(supabase, orgId, data.id, params.contact_id)
  }

  return { success: true, data }
}

export async function updateTask(
  supabase: SupabaseClient,
  orgId: string,
  taskId: string,
  params: {
    title?: string
    description?: string
    status?: string
    column?: string
    priority?: string
  }
): Promise<TaskResult> {
  const updates: Record<string, unknown> = {}

  if (params.title) updates.title = params.title
  if (params.description !== undefined) updates.description = params.description
  if (params.status) updates.status = params.status
  if (params.priority) updates.priority = params.priority
  if (params.column) {
    const colId = await resolveColumnId(supabase, orgId, params.column)
    if (colId) updates.column_id = colId
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  // Fire-and-forget: timeline event
  writeTaskEvent(supabase, orgId, taskId, 'task_updated', updates)

  if (params.status === 'completed') {
    writeTaskEvent(supabase, orgId, taskId, 'task_completed', updates)
  }

  return { success: true, data }
}

export async function searchTasks(
  supabase: SupabaseClient,
  orgId: string,
  params: { query?: string; status?: string; priority?: string }
): Promise<SearchResult<Record<string, unknown>>> {
  let query = supabase.from('tasks').select('*').eq('org_id', orgId)

  if (params.status) query = query.eq('status', params.status)
  if (params.priority) query = query.eq('priority', params.priority)
  if (params.query) {
    query = query.or(`title.ilike.%${params.query}%,description.ilike.%${params.query}%`)
  }

  const { data, error } = await query.order('position').limit(20)
  if (error) return { success: false, error: error.message }
  return { success: true, data: { results: data ?? [], total: data?.length ?? 0 } }
}

// --- Contact CRUD ---

export async function getContact(supabase: SupabaseClient, orgId: string, slug: string): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('org_id', orgId)
    .eq('slug', slug)
    .single()

  if (error) return null
  return data as Contact
}

export async function searchContacts(
  supabase: SupabaseClient,
  orgId: string,
  query: string
): Promise<ContactMatch[]> {
  const ranked = await resolveEntityRanked(supabase, query, orgId)
  return ranked.map((r) => ({
    contact: r.contact,
    matchConfidence: r.matchConfidence,
    matchStep: r.matchStep,
  }))
}

// --- Invoice CRUD ---

export async function createInvoice(
  supabase: SupabaseClient,
  orgId: string,
  params: {
    invoice_number: string
    client_contact_id: string
    items: InvoiceLineItem[]
    due_date: string
    currency?: string
    project_reference?: string
    source_intent?: string | null
    created_by?: string
  }
): Promise<InvoiceResult> {
  const subtotal = params.items.reduce((sum, item) => sum + item.total, 0)
  const tax = subtotal * 0.1 // 10% GST (AU default)
  const total = subtotal + tax

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      org_id: orgId,
      invoice_number: params.invoice_number,
      client_contact_id: params.client_contact_id,
      items: params.items,
      subtotal,
      tax,
      total,
      currency: params.currency || 'AUD',
      project_reference: params.project_reference ?? '',
      source_intent: params.source_intent ?? null,
      created_by: params.created_by ?? 'manual',
      due_date: params.due_date,
      issued_date: new Date().toISOString().split('T')[0],
      status: 'draft' as InvoiceStatus,
      reminder_count: 0,
    })
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function updateInvoice(
  supabase: SupabaseClient,
  orgId: string,
  invoiceId: string,
  params: {
    status?: InvoiceStatus
    paid_date?: string
    payment_method?: string
  }
): Promise<InvoiceResult> {
  const updates: Record<string, unknown> = {}

  if (params.status) updates.status = params.status
  if (params.paid_date) updates.paid_date = params.paid_date
  if (params.payment_method) updates.payment_method = params.payment_method

  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', invoiceId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function searchInvoices(
  supabase: SupabaseClient,
  orgId: string,
  params: { status?: InvoiceStatus; client_contact_id?: string }
): Promise<SearchResult<Record<string, unknown>>> {
  let query = supabase.from('invoices').select('*').eq('org_id', orgId)

  if (params.status) query = query.eq('status', params.status)
  if (params.client_contact_id) query = query.eq('client_contact_id', params.client_contact_id)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(20)
  if (error) return { success: false, error: error.message }
  return { success: true, data: { results: data ?? [], total: data?.length ?? 0 } }
}

// --- Messages ---

export async function searchMessages(
  supabase: SupabaseClient,
  orgId: string,
  params: { channel?: string; contact_id?: string; query?: string; since?: string }
): Promise<SearchResult<ChannelMessage>> {
  let dbQuery = supabase.from('channel_messages').select('*').eq('org_id', orgId)

  if (params.channel) dbQuery = dbQuery.eq('channel', params.channel)
  if (params.contact_id) dbQuery = dbQuery.eq('contact_id', params.contact_id)
  if (params.query) dbQuery = dbQuery.ilike('body', `%${params.query}%`)
  if (params.since) dbQuery = dbQuery.gte('timestamp', params.since)

  const { data, error } = await dbQuery.order('timestamp', { ascending: false }).limit(50)
  if (error) return { success: false, error: error.message }
  return { success: true, data: { results: (data ?? []) as ChannelMessage[], total: data?.length ?? 0 } }
}

// --- Activity ---

export async function logActivity(
  supabase: SupabaseClient,
  orgId: string,
  params: { action_type: string; action: string; reasoning?: string; result?: string }
): Promise<CrudResult<{ id: string }>> {
  const { data, error } = await supabase
    .from('activity_feed')
    .insert({
      org_id: orgId,
      action_type: params.action_type,
      action: params.action,
      reasoning: params.reasoning || null,
      result: params.result || null,
    })
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: { id: data.id } }
}
