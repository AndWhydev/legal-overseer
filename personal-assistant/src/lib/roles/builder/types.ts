// ---------------------------------------------------------------------------
// Builder Role — State & Config Interfaces
// ---------------------------------------------------------------------------

/**
 * Shape of the JSONB stored in role_states.state for the builder role.
 * All fields are optional for backward compat with existing state rows.
 */
export interface BuilderState {
  last_generation_at: string | null
  active_project_ids: string[]
  total_sites_generated: number
  total_deployments: number
}

/**
 * Builder config fields stored in role_configs.config JSONB.
 */
export interface BuilderConfig {
  auto_preview: boolean
  default_template: string | null
  wordpress_sites: Array<{
    site_url: string
    label: string
  }>
}
