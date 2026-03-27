import Anthropic from '@anthropic-ai/sdk'
import type { AgentToolHandler, ToolResult } from '../tools'
import type { WebsiteCategory } from '@/lib/builder/types'
import { generateWebsite, reviseWebsite } from '@/lib/builder/generator'
import { listTemplates } from '@/lib/builder/templates'

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export const builderToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'generate_website',
    description:
      'Generate a complete, responsive website from a template or description. Creates a professional single-page site. The generated HTML will be shown as a live preview artifact in the chat. If a template_id is provided, uses that as a starting point. Otherwise, generates from the description using AI.',
    input_schema: {
      type: 'object' as const,
      properties: {
        template_id: {
          type: 'string',
          description:
            'Optional starter template ID to base the design on. Use list_website_templates to browse available templates.',
        },
        business_name: {
          type: 'string',
          description: 'The name of the business the website is for',
        },
        industry: {
          type: 'string',
          description:
            'The industry or type of business (e.g. plumbing, real estate, restaurant)',
        },
        description: {
          type: 'string',
          description:
            'Description of what the website should include and convey',
        },
        primary_color: {
          type: 'string',
          description: 'Primary brand color as a hex value (e.g. #2563eb)',
        },
        accent_color: {
          type: 'string',
          description: 'Accent color as a hex value (e.g. #f59e0b)',
        },
        contact_id: {
          type: 'string',
          description:
            'Optional contact UUID to associate this website project with',
        },
      },
      required: ['business_name', 'industry', 'description'],
    },
  },
  {
    name: 'list_website_templates',
    description:
      'Browse available website templates. Optionally filter by category (agency, trades, professional, restaurant, ecommerce, portfolio, landing). Returns template names, descriptions, and categories.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: [
            'agency',
            'trades',
            'professional',
            'restaurant',
            'ecommerce',
            'portfolio',
            'landing',
          ],
          description: 'Filter templates by category',
        },
      },
    },
  },
  {
    name: 'revise_website',
    description:
      'Make changes to an existing generated website. Describe what you want to change and the current site will be updated. The revised HTML will be shown as a live preview artifact.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: {
          type: 'string',
          description: 'The website project ID to revise',
        },
        instruction: {
          type: 'string',
          description:
            'What to change about the website (e.g. "make the header blue", "add a testimonials section")',
        },
      },
      required: ['project_id', 'instruction'],
    },
  },
]

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

export const builderToolHandlers: Record<string, AgentToolHandler> = {
  async generate_website(input, orgId, supabase): Promise<ToolResult> {
    try {
      const businessName = input.business_name as string
      const industry = input.industry as string
      const description = input.description as string
      const templateId = input.template_id as string | undefined
      const primaryColor = input.primary_color as string | undefined
      const accentColor = input.accent_color as string | undefined
      const contactId = input.contact_id as string | undefined

      const result = await generateWebsite(
        {
          template_id: templateId,
          business_name: businessName,
          industry,
          description,
          colors:
            primaryColor || accentColor
              ? {
                  primary: primaryColor ?? '#2563eb',
                  accent: accentColor ?? '#f59e0b',
                }
              : undefined,
        },
        orgId,
        supabase
      )

      // Link to contact if provided
      if (contactId) {
        await supabase
          .from('website_projects')
          .update({ contact_id: contactId })
          .eq('id', result.project.id)
          .eq('org_id', orgId)
      }

      return {
        success: true,
        data: {
          project_id: result.project.id,
          project_name: result.project.name,
          slug: result.project.slug,
          template_used: templateId ?? 'custom',
          artifact: {
            type: 'html',
            title: `${businessName} Website`,
            content: result.html,
          },
        },
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate website: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },

  async list_website_templates(input): Promise<ToolResult> {
    try {
      const category = input.category as WebsiteCategory | undefined
      const templates = listTemplates(category)

      const summaries = templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        variables: t.variables.map((v) => v.key),
      }))

      return {
        success: true,
        data: {
          templates: summaries,
          total: summaries.length,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to list templates: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },

  async revise_website(input, orgId, supabase): Promise<ToolResult> {
    try {
      const projectId = input.project_id as string
      const instruction = input.instruction as string

      const result = await reviseWebsite(projectId, instruction, orgId, supabase)

      return {
        success: true,
        data: {
          project_id: result.project.id,
          project_name: result.project.name,
          change_summary: instruction,
          artifact: {
            type: 'html',
            title: `${result.project.name} Website`,
            content: result.html,
          },
        },
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to revise website: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
}
