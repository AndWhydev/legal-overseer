import Anthropic from '@anthropic-ai/sdk'
import type { AgentToolHandler, ToolResult } from '../tools'
import {
  searchTenders,
  scoreTenderFit,
  generateTenderResponse,
} from '../tender-hunter'

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export const tenderToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'search_tenders',
    description:
      'Search for government tenders matching specified keywords, region, and minimum value. Scans AusTender and other Australian tender sources. Returns matching open tenders with title, description, deadline, estimated value, and category. Results are persisted for subsequent scoring and response generation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: "Keywords to search for (e.g. 'web design', 'digital transformation', 'IT services')",
        },
        region: {
          type: 'string',
          description: "Geographic region to filter by (e.g. 'Brisbane', 'Queensland', 'National')",
        },
        min_value: {
          type: 'number',
          description: 'Minimum contract value in AUD to filter results',
        },
      },
      required: ['keywords'],
    },
  },
  {
    name: 'score_tender',
    description:
      'Score a specific tender for fit against the organisation\'s capability profiles. Evaluates compliance, effort-vs-value ratio, win probability, and provides a pursue/consider/skip recommendation with reasoning. Identifies matched capabilities and gaps.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tender_id: {
          type: 'string',
          description: 'ID of the tender to score (from search_tenders results)',
        },
      },
      required: ['tender_id'],
    },
  },
  {
    name: 'generate_tender_response',
    description:
      'Generate a draft tender response for a specific tender. Produces structured response sections, requirements checklist, and compliance matrix based on the organisation\'s capability profiles and past projects. Returns a draft ready for human review.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tender_id: {
          type: 'string',
          description: 'ID of the tender to generate a response for',
        },
      },
      required: ['tender_id'],
    },
  },
]

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

export const tenderToolHandlers: Record<string, AgentToolHandler> = {
  async search_tenders(input, orgId, supabase): Promise<ToolResult> {
    try {
      const keywords = input.keywords as string[]
      const region = input.region as string | undefined
      const minValue = input.min_value as number | undefined

      const result = await searchTenders(supabase, orgId, {
        keywords,
        region,
        minValue,
      })

      return {
        success: true,
        data: {
          tenders: result.tenders,
          count: result.count,
          source: result.source,
          searchedAt: result.searchedAt,
        },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async score_tender(input, orgId, supabase): Promise<ToolResult> {
    try {
      const tenderId = input.tender_id as string

      const result = await scoreTenderFit(supabase, orgId, tenderId)

      return { success: true, data: result }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async generate_tender_response(input, orgId, supabase): Promise<ToolResult> {
    try {
      const tenderId = input.tender_id as string

      const result = await generateTenderResponse(supabase, orgId, tenderId)

      return {
        success: true,
        data: {
          id: result.id,
          tender_id: result.tender_id,
          status: result.status,
          sections: result.content.sections,
          requirements_checklist: result.content.requirements_checklist,
          compliance_matrix: result.content.compliance_matrix,
          compliance_score: result.compliance_score,
          fit_score: result.fit_score,
          estimated_effort_hours: result.estimated_effort_hours,
        },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}
