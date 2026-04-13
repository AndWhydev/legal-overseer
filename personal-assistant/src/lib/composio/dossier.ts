/**
 * Connection Dossier Builder
 *
 * When a Composio third-party connection is successfully established,
 * we crawl the available MCP tools for that connection and synthesize a
 * structured "dossier" describing the capabilities now available to the
 * agent. The dossier is written into Living Brain v2 via the WAL so the
 * intake clerk can route it into operational domain memory.
 *
 * One Gemini Flash call per dossier: all tools are batched into a single
 * prompt to synthesize use cases.
 */

import { gateway, generateText } from 'ai'

import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import { getMCPTools } from './mcp-session'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ToolSummary {
  /** Tool identifier as exposed by the MCP server (e.g. GMAIL_SEND_EMAIL). */
  name: string
  /** Tool description from the MCP schema (may be empty). */
  description: string
  /** Top-level input schema keys only — not the full nested spec. */
  inputKeys: string[]
}

export interface ConnectionDossier {
  /** Composio app key (e.g. "gmail", "notion", "slack"). */
  appKey: string
  /** Composio connected_account_id for this instance of the connection. */
  connectedAccountId: string
  /** ISO timestamp when the dossier was built. */
  connectedAt: string
  /** Deduplicated list of high-level capability names (tool names). */
  capabilities: string[]
  /** Compact summary per tool: name, description, top-level input keys. */
  tools: ToolSummary[]
  /** LLM-synthesized plain-English narrative of use cases this connection enables. */
  suggestedUseCases: string
}

// ─── Tool filtering ─────────────────────────────────────────────────────────

/**
 * Composio tool names are typically prefixed with the app key
 * (e.g. GMAIL_SEND_EMAIL, NOTION_CREATE_PAGE). This lets us filter an
 * org-wide MCP session down to just the tools for one connection.
 *
 * If no tools match the prefix (e.g. custom tool naming), we fall back
 * to the full list — the dossier is still useful.
 */
function filterToolsForApp<T extends { name: string }>(
  tools: T[],
  appKey: string,
): T[] {
  const prefix = appKey.toUpperCase().replace(/-/g, '_')
  const matched = tools.filter((t) =>
    t.name.toUpperCase().startsWith(prefix + '_') ||
    t.name.toUpperCase().startsWith(prefix),
  )
  return matched.length > 0 ? matched : tools
}

function extractInputKeys(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') return []
  const obj = schema as Record<string, unknown>
  const props = obj.properties
  if (!props || typeof props !== 'object') return []
  return Object.keys(props as Record<string, unknown>)
}

// ─── Use-case synthesis prompt ──────────────────────────────────────────────

const USE_CASE_SYSTEM_PROMPT = `You are a capability analyst for a personal AI assistant.
Given a list of tools that a user has just connected via a third-party integration,
describe in 3-6 sentences what new use cases this unlocks for the assistant.

Rules:
- Focus on what the user/assistant can now DO, not on how the API works.
- Use plain English. No bullet points. No markdown. No headings.
- Be concrete: reference specific actions (e.g. "draft and send email", "schedule meetings").
- Do not speculate about tools that are not in the list.
- Keep the entire response under 600 characters.`

/**
 * Ask Gemini Flash to synthesize a human-readable narrative describing
 * what the agent can now do with this connection. Falls back to a
 * deterministic summary if the LLM call fails.
 */
async function synthesizeUseCases(
  appKey: string,
  tools: ToolSummary[],
): Promise<string> {
  if (tools.length === 0) {
    return `Connected ${appKey}, but no tools were discovered for this account.`
  }

  const toolList = tools
    .map((t) => `- ${t.name}: ${t.description || '(no description)'}`)
    .join('\n')

  const prompt = `Connection: ${appKey}\n\nAvailable tools:\n${toolList}`

  try {
    const { text } = await generateText({
      model: gateway(models.fast),
      system: USE_CASE_SYSTEM_PROMPT,
      prompt,
    })
    const cleaned = text.trim()
    if (cleaned.length > 0) return cleaned
    return fallbackUseCases(appKey, tools)
  } catch (err) {
    logger.warn('[composio/dossier] Use-case synthesis failed', {
      appKey,
      error: err instanceof Error ? err.message : String(err),
    })
    return fallbackUseCases(appKey, tools)
  }
}

function fallbackUseCases(appKey: string, tools: ToolSummary[]): string {
  const preview = tools
    .slice(0, 5)
    .map((t) => t.name)
    .join(', ')
  return `Connection to ${appKey} provides ${tools.length} tool${tools.length === 1 ? '' : 's'} (e.g. ${preview}).`
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface BuildDossierParams {
  orgId: string
  appKey: string
  connectedAccountId: string
}

/**
 * Build a ConnectionDossier for a newly established connection.
 *
 * Side effects: one LLM call (Gemini Flash) to synthesize use cases.
 * Never throws — returns an empty-but-valid dossier if tool discovery fails.
 */
export async function buildConnectionDossier(
  params: BuildDossierParams,
): Promise<ConnectionDossier> {
  const { orgId, appKey, connectedAccountId } = params
  const connectedAt = new Date().toISOString()

  // NOTE: getMCPTools returns tools for the org's whole MCP session
  // (across all connected apps). We filter by appKey prefix; Composio
  // tool names are conventionally `{APPKEY}_{VERB}_{NOUN}`.
  const allTools = await getMCPTools(orgId)
  const appTools = filterToolsForApp(allTools, appKey)

  const toolSummaries: ToolSummary[] = appTools.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    inputKeys: extractInputKeys(t.input_schema),
  }))

  // Dedupe capability names (tool names are already unique but be safe)
  const capabilities = Array.from(new Set(toolSummaries.map((t) => t.name)))

  const suggestedUseCases = await synthesizeUseCases(appKey, toolSummaries)

  return {
    appKey,
    connectedAccountId,
    connectedAt,
    capabilities,
    tools: toolSummaries,
    suggestedUseCases,
  }
}
