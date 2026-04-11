import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GenerationRequest, WebsiteProject } from './types'
import { getTemplate } from './templates'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Website Generation Engine
// ---------------------------------------------------------------------------

const anthropic = new Anthropic()

const GENERATE_SYSTEM_PROMPT = `You are an expert web designer. Generate a complete, responsive, single-page HTML website. The HTML must be self-contained with all styles in a <style> block. Use modern CSS (flexbox, grid, CSS variables). The site must look professional and be mobile-responsive. Use placeholder images from https://placehold.co/. Do NOT use any external CSS frameworks or JavaScript frameworks. Return ONLY the HTML content, no markdown fences.`

const REVISE_SYSTEM_PROMPT = `You are an expert web designer. You will receive an existing HTML website and a revision instruction. Apply the requested changes to the HTML. Maintain the overall structure and responsiveness. Return ONLY the complete updated HTML, no markdown fences.`

/**
 * Generate a URL-safe slug from a business name.
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

/**
 * Apply template variable substitution using {{mustache}} syntax.
 */
function applyTemplateVariables(
  html: string,
  request: GenerationRequest
): string {
  let result = html
  result = result.replace(/\{\{business_name\}\}/g, request.business_name)
  if (request.colors?.primary) {
    result = result.replace(/\{\{primary_color\}\}/g, request.colors.primary)
  }
  if (request.colors?.accent) {
    result = result.replace(/\{\{accent_color\}\}/g, request.colors.accent)
  }
  return result
}

/**
 * Generate a website from a template or AI generation.
 *
 * If `request.template_id` is provided, loads the template and applies variable
 * substitution. Otherwise generates from scratch using Claude.
 *
 * Persists the result to `website_projects` and `website_revisions`.
 */
export async function generateWebsite(
  request: GenerationRequest,
  orgId: string,
  supabase: SupabaseClient
): Promise<{ html: string; css: string; project: WebsiteProject }> {
  let html: string
  let css = ''

  if (request.template_id) {
    // Template-based generation
    const template = getTemplate(request.template_id)
    if (!template) {
      throw new Error(`Template not found: ${request.template_id}`)
    }
    html = applyTemplateVariables(template.html, request)
    css = template.css
  } else {
    // AI-powered generation from scratch
    const userPrompt = buildGenerationPrompt(request)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: GENERATE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in generation response')
    }

    html = stripMarkdownFences(textBlock.text)
  }

  // Persist to database
  const slug = toSlug(request.business_name)

  const { data: project, error: projectError } = await supabase
    .from('website_projects')
    .insert({
      org_id: orgId,
      name: request.business_name,
      slug,
      description: request.description,
      template_id: request.template_id ?? null,
      status: 'preview',
      html_content: html,
      css_content: css || null,
      metadata: {
        generation_request: request,
        generated_at: new Date().toISOString(),
      },
    })
    .select()
    .single()

  if (projectError) {
    logger.error('Failed to create website project', { error: projectError })
    throw new Error(`Failed to create website project: ${projectError.message}`)
  }

  // Create initial revision
  const { error: revisionError } = await supabase
    .from('website_revisions')
    .insert({
      project_id: project.id,
      version: 1,
      html_content: html,
      css_content: css || null,
      change_summary: 'Initial generation',
      created_by: 'agent',
    })

  if (revisionError) {
    logger.error('Failed to create initial revision', { error: revisionError })
  }

  return { html, css, project: project as WebsiteProject }
}

/**
 * Revise an existing website with a natural-language instruction.
 *
 * Loads the current project HTML, sends it to Claude with the revision
 * instruction, updates the project, and creates a new revision record.
 */
export async function reviseWebsite(
  projectId: string,
  instruction: string,
  orgId: string,
  supabase: SupabaseClient
): Promise<{ html: string; css: string; project: WebsiteProject }> {
  // Load existing project
  const { data: project, error: loadError } = await supabase
    .from('website_projects')
    .select('*')
    .eq('id', projectId)
    .eq('org_id', orgId)
    .single()

  if (loadError || !project) {
    throw new Error(`Website project not found: ${projectId}`)
  }

  const currentHtml = project.html_content
  if (!currentHtml) {
    throw new Error('No HTML content to revise')
  }

  // Call Claude for revision
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: REVISE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Current website HTML:\n\`\`\`\n${currentHtml}\n\`\`\`\n\nRevision request: ${instruction}`,
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in revision response')
  }

  const html = stripMarkdownFences(textBlock.text)
  const css = project.css_content ?? ''

  // Get latest version number
  const { data: latestRevision } = await supabase
    .from('website_revisions')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  const nextVersion = (latestRevision?.version ?? 0) + 1

  // Update project
  const { data: updatedProject, error: updateError } = await supabase
    .from('website_projects')
    .update({
      html_content: html,
      status: 'preview',
      metadata: {
        ...((project.metadata as Record<string, unknown>) ?? {}),
        last_revision: instruction,
        last_revised_at: new Date().toISOString(),
      },
    })
    .eq('id', projectId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (updateError) {
    logger.error('Failed to update website project', { error: updateError })
    throw new Error(`Failed to update website project: ${updateError.message}`)
  }

  // Create revision record
  const { error: revisionError } = await supabase
    .from('website_revisions')
    .insert({
      project_id: projectId,
      version: nextVersion,
      html_content: html,
      css_content: css || null,
      change_summary: instruction,
      created_by: 'agent',
    })

  if (revisionError) {
    logger.error('Failed to create revision', { error: revisionError })
  }

  return { html, css, project: updatedProject as WebsiteProject }
}

/**
 * Load the current HTML content for a website project.
 */
export async function getProjectHtml(
  projectId: string,
  orgId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase
    .from('website_projects')
    .select('html_content')
    .eq('id', projectId)
    .eq('org_id', orgId)
    .single()

  return data?.html_content ?? null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildGenerationPrompt(request: GenerationRequest): string {
  const parts: string[] = [
    `Create a professional website for "${request.business_name}".`,
    `Industry: ${request.industry}.`,
    `Description: ${request.description}.`,
  ]

  if (request.colors?.primary) {
    parts.push(`Primary brand color: ${request.colors.primary}.`)
  }
  if (request.colors?.accent) {
    parts.push(`Accent color: ${request.colors.accent}.`)
  }

  if (request.pages && request.pages.length > 0) {
    parts.push(
      `Include these sections: ${request.pages.join(', ')}.`
    )
  } else {
    parts.push(
      'Include sections for: hero banner, about/services, testimonials or features, and a contact section with a form.'
    )
  }

  return parts.join('\n')
}

function stripMarkdownFences(text: string): string {
  // Remove leading ```html and trailing ```
  return text
    .replace(/^```(?:html)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim()
}
