// ---------------------------------------------------------------------------
// Deployment Pipeline Orchestrator
// ---------------------------------------------------------------------------
// Orchestrates WordPress deployment: connection test, Elementor detection,
// HTML-to-Elementor conversion (when applicable), page creation, and
// status updates.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { DeploymentStatus, DeploymentTarget, WebsiteProject } from './types'
import { createWordPressClient, WordPressError } from './wordpress-client'
import { htmlToElementorJson, elementorJsonToMeta } from './elementor-export'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeployResult {
  success: boolean
  pageId?: number
  pageUrl?: string
  elementorUsed?: boolean
  error?: string
}

interface WordPressCredentials {
  username: string
  applicationPassword: string
}

// ---------------------------------------------------------------------------
// WordPress Deployment
// ---------------------------------------------------------------------------

/**
 * Deploy a website project to a connected WordPress site.
 *
 * Flow:
 * 1. Load project from DB (verify ownership)
 * 2. Validate project has content and a WordPress deploy target
 * 3. Resolve WordPress credentials from deploy_target
 * 4. Test the connection
 * 5. Detect Elementor on the target site
 * 6. If Elementor detected + compatible: convert HTML to Elementor JSON
 * 7. Create/update WordPress page
 * 8. Update project status in DB
 */
export async function deployToWordPress(
  projectId: string,
  orgId: string,
  supabase: SupabaseClient,
): Promise<DeployResult> {
  try {
    // 1. Load project and verify ownership
    const { data: project, error: loadError } = await supabase
      .from('website_projects')
      .select('*')
      .eq('id', projectId)
      .eq('org_id', orgId)
      .single()

    if (loadError || !project) {
      logger.error('Deploy: project not found or access denied', { projectId, orgId })
      return { success: false, error: 'Project not found or access denied' }
    }

    const wp = project as WebsiteProject

    // 2. Validate content and deploy target
    if (!wp.html_content) {
      return { success: false, error: 'Project has no HTML content to deploy' }
    }

    if (!wp.deploy_target || wp.deploy_target.type !== 'wordpress') {
      return { success: false, error: 'Project does not have a WordPress deployment target configured' }
    }

    const target = wp.deploy_target as DeploymentTarget & { credentials?: WordPressCredentials }

    // 3. Resolve credentials
    // Future: resolve from org_integrations encrypted store via api_key_ref
    // For now: expect credentials inline in deploy_target
    if (!target.credentials?.username || !target.credentials?.applicationPassword) {
      return {
        success: false,
        error: 'WordPress credentials not configured. Set deploy_target.credentials with username and applicationPassword.',
      }
    }

    const client = createWordPressClient({
      siteUrl: target.site_url,
      username: target.credentials.username,
      applicationPassword: target.credentials.applicationPassword,
    })

    // 4. Test connection
    logger.info('Deploy: testing WordPress connection', { siteUrl: target.site_url })
    const conn = await client.testConnection()
    if (!conn.success) {
      return {
        success: false,
        error: `Cannot connect to WordPress at ${target.site_url}. Verify the site URL and application password are correct.`,
      }
    }
    logger.info('Deploy: connected to WordPress', { siteName: conn.siteName, wpVersion: conn.wpVersion })

    // 5. Check for Elementor
    const elementorCheck = await client.checkElementor()
    const useElementor = elementorCheck.installed && (target.elementor_compatible ?? false)

    logger.info('Deploy: Elementor status', {
      installed: elementorCheck.installed,
      version: elementorCheck.version,
      willUse: useElementor,
    })

    // 6 & 7. Create the page
    let pageResult

    if (useElementor) {
      // Elementor path: create page with minimal wrapper, set Elementor meta
      const elementorDoc = htmlToElementorJson(wp.html_content)
      const elementorData = elementorJsonToMeta(elementorDoc)

      // Create page with a minimal content wrapper
      pageResult = await client.createPage({
        title: wp.name,
        content: `<!-- Elementor-managed page: ${wp.name} -->`,
        status: 'draft',
        slug: wp.slug,
        meta: {
          _elementor_data: elementorData,
          _elementor_edit_mode: 'builder',
        },
      })

      logger.info('Deploy: created Elementor page', { pageId: pageResult.id })
    } else {
      // Standard WP path: push full HTML as page content
      // Wrap CSS in a style block if present
      let content = wp.html_content
      if (wp.css_content) {
        content = `<style>${wp.css_content}</style>\n${content}`
      }

      pageResult = await client.createPage({
        title: wp.name,
        content,
        status: 'draft',
        slug: wp.slug,
      })

      logger.info('Deploy: created standard WordPress page', { pageId: pageResult.id })
    }

    // 8. Update project status in DB
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('website_projects')
      .update({
        status: 'deployed',
        deployed_at: now,
        deployed_url: pageResult.link,
      })
      .eq('id', projectId)

    if (updateError) {
      logger.warn('Deploy: page created but failed to update project status', {
        pageId: pageResult.id,
        error: updateError.message,
      })
    }

    return {
      success: true,
      pageId: pageResult.id,
      pageUrl: pageResult.link,
      elementorUsed: useElementor,
    }
  } catch (err) {
    const message = err instanceof WordPressError
      ? `WordPress error [${err.code}]: ${err.message}`
      : err instanceof Error
        ? err.message
        : 'Unknown deployment error'

    logger.error('Deploy: deployment failed', { projectId, error: message })
    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Deployment Status Query
// ---------------------------------------------------------------------------

/**
 * Check the current deployment status of a website project.
 */
export async function checkDeploymentStatus(
  projectId: string,
  orgId: string,
  supabase: SupabaseClient,
): Promise<{ status: DeploymentStatus; url: string | null; deployedAt: string | null }> {
  const { data, error } = await supabase
    .from('website_projects')
    .select('status, deployed_url, deployed_at')
    .eq('id', projectId)
    .eq('org_id', orgId)
    .single()

  if (error || !data) {
    logger.error('checkDeploymentStatus: project not found', { projectId, orgId })
    return { status: 'failed', url: null, deployedAt: null }
  }

  // Map website status to deployment status
  const statusMap: Record<string, DeploymentStatus> = {
    draft: 'pending',
    generating: 'deploying',
    preview: 'pending',
    deployed: 'success',
    archived: 'failed',
  }

  return {
    status: statusMap[data.status as string] ?? 'pending',
    url: (data.deployed_url as string) ?? null,
    deployedAt: (data.deployed_at as string) ?? null,
  }
}
