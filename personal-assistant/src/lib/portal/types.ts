export interface PortalAccess {
  id: string
  org_id: string
  contact_id: string
  user_id: string | null
  email: string
  invite_token: string
  status: 'invited' | 'active' | 'revoked'
  permissions: PortalPermissions
  last_login_at: string | null
  created_at: string
  updated_at: string
}

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
  created_at: string
  updated_at: string
}

export interface PortalFile {
  id: string
  org_id: string
  contact_id: string
  project_id: string | null
  uploaded_by_portal: boolean
  uploaded_by_user_id: string | null
  file_name: string
  file_size: number
  mime_type: string
  storage_path: string
  description: string | null
  created_at: string
}

export interface PortalRequest {
  id: string
  org_id: string
  contact_id: string
  project_id: string | null
  task_id: string | null
  type: 'change_request' | 'bug_report' | 'question' | 'feedback'
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'submitted' | 'acknowledged' | 'in_progress' | 'completed' | 'closed'
  attachments: unknown[]
  created_at: string
  updated_at: string
}

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
  currency: string
  issued_date: string | null
  due_date: string | null
  paid_date: string | null
  pdf_url: string | null
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
