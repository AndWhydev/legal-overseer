<<<<<<< HEAD
=======
// ─── Portal Types ────────────────────────────────────────────────────────────

>>>>>>> v1.5-marketing-launch
export interface PortalAccess {
  id: string
  org_id: string
  contact_id: string
  user_id: string | null
  email: string
<<<<<<< HEAD
  invite_token: string
  status: 'invited' | 'active' | 'revoked'
  permissions: PortalPermissions
=======
  role: 'viewer' | 'editor' | 'admin'
  status: 'invited' | 'active' | 'revoked'
  invited_by: string | null
  invited_at: string
>>>>>>> v1.5-marketing-launch
  last_login_at: string | null
  created_at: string
  updated_at: string
}

<<<<<<< HEAD
export interface PortalPermissions {
  view_projects: boolean
  view_invoices: boolean
  upload_files: boolean
  submit_requests: boolean
}

export interface PortalBranding {
  id: string
  org_id: string
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  secondary_color: string
  font_family: string
  company_name: string | null
  tagline: string | null
  custom_domain: string | null
  custom_css: string | null
  footer_text: string | null
=======
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
>>>>>>> v1.5-marketing-launch
  created_at: string
  updated_at: string
}

export interface PortalFile {
  id: string
  org_id: string
  contact_id: string
  project_id: string | null
<<<<<<< HEAD
  uploaded_by_portal: boolean
  uploaded_by_user_id: string | null
  file_name: string
  file_size: number
  mime_type: string
  storage_path: string
  description: string | null
=======
  uploaded_by: string | null
  uploaded_by_role: 'agency' | 'client'
  file_name: string
  file_type: string | null
  file_size: number
  storage_path: string
  description: string | null
  category: 'general' | 'design' | 'document' | 'deliverable' | 'asset' | 'invoice' | 'contract'
>>>>>>> v1.5-marketing-launch
  created_at: string
}

export interface PortalRequest {
  id: string
  org_id: string
  contact_id: string
<<<<<<< HEAD
  project_id: string | null
  task_id: string | null
  type: 'change_request' | 'bug_report' | 'question' | 'feedback'
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'submitted' | 'acknowledged' | 'in_progress' | 'completed' | 'closed'
=======
  submitted_by: string | null
  task_id: string | null
  title: string
  description: string | null
  request_type: 'general' | 'change_request' | 'bug_report' | 'new_work' | 'question' | 'feedback'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'submitted' | 'reviewed' | 'in_progress' | 'completed' | 'closed'
>>>>>>> v1.5-marketing-launch
  attachments: unknown[]
  created_at: string
  updated_at: string
}

<<<<<<< HEAD
export interface PortalProject {
  id: string
  name: string
  description: string | null
  status: string
  metadata: Record<string, unknown>
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface PortalInvoice {
  id: string
  invoice_number: string
  status: string
  items: unknown[]
  subtotal: number
  tax: number
  total: number
=======
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
>>>>>>> v1.5-marketing-launch
  currency: string
  issued_date: string | null
  due_date: string | null
  paid_date: string | null
  pdf_url: string | null
<<<<<<< HEAD
  created_at: string
}

export interface PortalContext {
  access: PortalAccess
  branding: PortalBranding | null
  contact: {
    id: string
    name: string
    email: string
  }
  org: {
    id: string
    name: string
    slug: string
  }
}
=======
  items: unknown[]
  created_at: string
}
>>>>>>> v1.5-marketing-launch
