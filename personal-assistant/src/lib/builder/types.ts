// ---------------------------------------------------------------------------
// Builder Domain Types
// ---------------------------------------------------------------------------

/**
 * Website project status flow:
 * draft -> generating -> preview -> deployed
 *                                -> archived
 */
export type WebsiteStatus = 'draft' | 'generating' | 'preview' | 'deployed' | 'archived'

/**
 * Template categories matching the starter template library.
 */
export type WebsiteCategory =
  | 'agency'
  | 'trades'
  | 'professional'
  | 'restaurant'
  | 'ecommerce'
  | 'portfolio'
  | 'landing'

/**
 * A variable slot in a website template that users can customise.
 */
export interface TemplateVariable {
  key: string
  label: string
  type: 'text' | 'color' | 'image' | 'url'
  default: string
}

/**
 * A starter website template in the built-in library.
 */
export interface WebsiteTemplate {
  id: string
  name: string
  description: string
  category: WebsiteCategory
  thumbnail: string
  html: string
  css: string
  variables: TemplateVariable[]
}

/**
 * Persisted website project (matches website_projects table).
 */
export interface WebsiteProject {
  id: string
  org_id: string
  contact_id: string | null
  name: string
  slug: string
  description: string | null
  template_id: string | null
  status: WebsiteStatus
  html_content: string | null
  css_content: string | null
  metadata: Record<string, unknown>
  preview_url: string | null
  deploy_target: DeploymentTarget | null
  deployed_at: string | null
  deployed_url: string | null
  created_at: string
  updated_at: string
}

/**
 * A revision snapshot for a website project (matches website_revisions table).
 */
export interface WebsiteRevision {
  id: string
  project_id: string
  version: number
  html_content: string
  css_content: string | null
  change_summary: string | null
  created_by: 'user' | 'agent' | null
  created_at: string
}

/**
 * External deployment target configuration.
 */
export interface DeploymentTarget {
  type: 'wordpress' | 'vercel' | 'static'
  site_url: string
  api_key_ref?: string
  elementor_compatible?: boolean
}

/**
 * Deployment operation status.
 */
export type DeploymentStatus = 'pending' | 'deploying' | 'success' | 'failed'

/**
 * Request to generate a new website from a template or freeform description.
 */
export interface GenerationRequest {
  template_id?: string
  business_name: string
  industry: string
  description: string
  colors?: {
    primary: string
    accent: string
  }
  pages?: string[]
}
