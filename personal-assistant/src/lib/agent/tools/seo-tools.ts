import Anthropic from '@anthropic-ai/sdk'
import type { AgentToolHandler, ToolResult } from '../tools'
import {
  auditVisibility,
  generateOptimizedContent,
  generateSchemaMarkup,
  generateVisibilityReport,
  type SchemaType,
} from '../ai-search-optimizer'

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export const seoToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'audit_visibility',
    description:
      'Audit AI search visibility for a brand across Perplexity, ChatGPT Search, Gemini, and Copilot. Checks how prominently the brand appears in AI-generated search results for specified queries. Returns visibility score (0-100), per-query results, and actionable recommendations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand_name: {
          type: 'string',
          description: 'Brand or business name to check visibility for',
        },
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: "Search queries to audit (e.g. 'best web designer Brisbane')",
        },
        domain: {
          type: 'string',
          description: 'Website domain for the brand',
        },
        competitors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Competitor brand names to compare against',
        },
      },
      required: ['brand_name', 'queries'],
    },
  },
  {
    name: 'generate_seo_content',
    description:
      'Generate SEO-optimized content for AI search visibility. Produces a full article with FAQ section, structured data, meta description, and targeted queries. Content is crafted to be cited by AI search engines.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: 'Main topic for the content',
        },
        target_queries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Queries the content should rank for',
        },
        business_name: {
          type: 'string',
          description: 'Business name to feature',
        },
        location: {
          type: 'string',
          description: 'Geographic location for local SEO',
        },
        service_area: {
          type: 'string',
          description: 'Service area coverage',
        },
        credentials: {
          type: 'array',
          items: { type: 'string' },
          description: 'Relevant credentials or certifications to mention',
        },
      },
      required: ['topic', 'target_queries'],
    },
  },
  {
    name: 'generate_schema_markup',
    description:
      'Generate JSON-LD structured data markup for a web page. Supports LocalBusiness, Service, FAQ, Review, and Organization schema types. Returns valid JSON-LD and an HTML snippet ready to paste into a page.',
    input_schema: {
      type: 'object' as const,
      properties: {
        schema_type: {
          type: 'string',
          enum: ['LocalBusiness', 'Service', 'FAQ', 'Review', 'Organization'],
          description: 'Type of schema markup to generate',
        },
        data: {
          type: 'object',
          description: 'Schema-specific data fields (varies by schema_type)',
        },
      },
      required: ['schema_type', 'data'],
    },
  },
  {
    name: 'visibility_report',
    description:
      'Generate a comprehensive AI search visibility report comparing current and previous audit results. Shows score trends, per-query breakdown across AI search sources, competitor comparison with deltas, and prioritized recommendations. Requires at least one previous audit to have been run.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
]

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

export const seoToolHandlers: Record<string, AgentToolHandler> = {
  async audit_visibility(input, orgId, supabase): Promise<ToolResult> {
    try {
      const brandName = input.brand_name as string
      const queries = input.queries as string[]
      const domain = input.domain as string | undefined
      const competitors = input.competitors as string[] | undefined

      const result = await auditVisibility(supabase, orgId, {
        brandName,
        queries,
        domain,
        competitors,
      })

      return {
        success: true,
        data: {
          visibility_score: result.visibility_score,
          results: result.results,
          recommendations: result.recommendations,
          auditedAt: result.auditedAt,
        },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async generate_seo_content(input, orgId, supabase): Promise<ToolResult> {
    try {
      const topic = input.topic as string
      const targetQueries = input.target_queries as string[]
      const businessName = input.business_name as string | undefined
      const location = input.location as string | undefined
      const serviceArea = input.service_area as string | undefined
      const credentials = input.credentials as string[] | undefined

      const result = await generateOptimizedContent(supabase, orgId, {
        topic,
        targetQueries,
        businessName,
        location,
        serviceArea,
        credentials,
      })

      return { success: true, data: result }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async generate_schema_markup(input, _orgId, _supabase): Promise<ToolResult> {
    try {
      const schemaType = input.schema_type as SchemaType
      const data = input.data as Record<string, unknown>

      const result = generateSchemaMarkup({ schemaType, data: data as any })

      return {
        success: true,
        data: {
          schemaType: result.schemaType,
          jsonLd: result.jsonLd,
          htmlSnippet: result.htmlSnippet,
          validationNotes: result.validationNotes,
        },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async visibility_report(_input, orgId, supabase): Promise<ToolResult> {
    try {
      const result = await generateVisibilityReport(supabase, orgId)

      if (result === null) {
        return {
          success: false,
          error: 'No previous audits found. Run audit_visibility first to collect data.',
        }
      }

      return { success: true, data: result }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}
