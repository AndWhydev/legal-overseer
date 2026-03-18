// ─── Portal Types ────────────────────────────────────────────────────────────

export interface PortalAccess {
  id: string
  org_id: string
  contact_id: string
  user_id: string | null
  email: string
  role: 'viewer' | 'editor' | 'admin'
  status: 'invited' | 'active' | 'revoked'
  invited_by: string | null
  invited_at: string
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface PortalBranding {
  id: string
  org_id: string
  company_name: string | null
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  accent_color: string
  background_color: string
  font_family: string
  custom_css: string | null
  welcome_message: string | null
  support_email: string | null
  support_url: string | null
  created_at: string
  updated_at: string
}

export interface PortalFile {
  id: string
  org_id: string
  contact_id: string
  project_id: string | null
  uploaded_by: string | null
  uploaded_by_role: 'agency' | 'client'
  file_name: string
  file_type: string | null
  file_size: number
  storage_path: string
  description: string | null
  category: 'general' | 'design' | 'document' | 'deliverable' | 'asset' | 'invoice' | 'contract'
  created_at: string
}

export interface PortalRequest {
  id: string
  org_id: string
  contact_id: string
  submitted_by: string | null
  task_id: string | null
  title: string
  description: string | null
  request_type: 'general' | 'change_request' | 'bug_report' | 'new_work' | 'question' | 'feedback'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'submitted' | 'reviewed' | 'in_progress' | 'completed' | 'closed'
  attachments: unknown[]
  created_at: string
  updated_at: string
}

export interface PortalActivity {
  id: string
  org_id: string
  contact_id: string
  activity_type: string
  title: string
  description: string | null
  metadata: Record<string, unknown>
  read: boolean
  created_at: string
}

export interface PortalNotification {
  id: string
  org_id: string
  contact_id: string
  portal_access_id: string
  channel: 'in_app' | 'email' | 'both'
  notification_type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  sent_at: string | null
  created_at: string
}

export interface PortalProject {
  id: string
  org_id: string
  contact_id: string
  title: string
  description: string | null
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  progress: number
  current_phase: string | null
  start_date: string | null
  target_date: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PortalProjectTask {
  id: string
  portal_project_id: string
  task_id: string
  visible_to_client: boolean
  display_name: string | null
  is_milestone: boolean
  position: number
}

/** Combined context for an authenticated portal user */
export interface PortalContext {
  access: PortalAccess
  branding: PortalBranding | null
  orgName: string
  contactName: string
}

/** Invoice as seen by portal client (read-only) */
export interface PortalInvoice {
  id: string
  invoice_number: string
  status: 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled'
  total: number
  subtotal: number
  tax: number
  currency: string
  issued_date: string | null
  due_date: string | null
  paid_date: string | null
  pdf_url: string | null
  items: unknown[]
  created_at: string
}
