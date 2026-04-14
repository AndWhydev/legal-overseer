/**
 * UnifiedToolCatalog — single view of all tools the agent can call,
 * whether they're native BitBit handlers or Composio-backed actions on
 * a connected third-party account.
 *
 * Design goals (inspired by Claude Code's tool/MCP architecture):
 *
 *   1. Lightweight descriptors by default. listDescriptors() returns
 *      `{ name, summary, source, connectionId }` — tiny enough that a
 *      user with 30 connected apps still fits comfortably in the
 *      system prompt.
 *
 *   2. Lazy schema loading. loadSchema(name) fetches the full JSON
 *      schema only when the model actually wants to call that tool.
 *      Results are cached per-org with a TTL.
 *
 *   3. Name-based dispatch. dispatch(name, input, ctx) looks up the
 *      tool once and routes to the right backend. There is no
 *      branching on `source` at any call site outside the catalog
 *      itself — if you add a new backend later, it plugs into one
 *      method here.
 *
 * This module is orthogonal to the existing composio meta-tools in
 * src/lib/agent/tools/composio-tools.ts; agents can opt in via the
 * `UNIFIED_TOOLS=true` env flag, then we'll delete the meta-tools after
 * parity is confirmed.
 */
import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../../core/logger'
import {
  getComposioClient,
  isComposioEnabled,
  listConnectedAccounts,
} from '../../composio'
import type { ToolDescriptor, ToolDispatchResult } from './descriptors'

// ─── Cache entry ─────────────────────────────────────────────────────────────

interface SchemaCacheEntry {
  tool: Anthropic.Tool
  loadedAt: number
}

interface DescriptorCacheEntry {
  descriptors: ToolDescriptor[]
  loadedAt: number
}

const DEFAULT_TTL_MS = 10 * 60 * 1000

// ─── Options ─────────────────────────────────────────────────────────────────

export interface UnifiedToolCatalogOptions {
  /** Anthropic.Tool definitions for first-party (native) tools. */
  nativeTools: Anthropic.Tool[]
  /** Native tool handlers keyed by tool name. */
  nativeHandlers: Record<
    string,
    (
      input: Record<string, unknown>,
      orgId: string,
      supabase: SupabaseClient,
    ) => Promise<ToolDispatchResult>
  >
  /** TTL for the per-org descriptor + schema caches. */
  ttlMs?: number
}

export interface DispatchContext {
  orgId: string
  supabase: SupabaseClient
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export class UnifiedToolCatalog {
  private readonly nativeToolIndex: Map<string, Anthropic.Tool>
  private readonly descriptorCache = new Map<string, DescriptorCacheEntry>()
  private readonly schemaCache = new Map<string, Map<string, SchemaCacheEntry>>()
  private readonly ttl: number

  constructor(private opts: UnifiedToolCatalogOptions) {
    this.nativeToolIndex = new Map(
      opts.nativeTools.map((t) => [t.name, t]),
    )
    this.ttl = opts.ttlMs ?? DEFAULT_TTL_MS
  }

  // ── Descriptors (session start) ──────────────────────────────────────────

  async listDescriptors(orgId: string, opts: { force?: boolean } = {}): Promise<ToolDescriptor[]> {
    const cached = this.descriptorCache.get(orgId)
    if (cached && !opts.force && Date.now() - cached.loadedAt < this.ttl) {
      return cached.descriptors
    }

    const native = this.buildNativeDescriptors()
    const composio = await this.buildComposioDescriptors(orgId)
    const descriptors = [...native, ...composio]

    this.descriptorCache.set(orgId, { descriptors, loadedAt: Date.now() })
    return descriptors
  }

  private buildNativeDescriptors(): ToolDescriptor[] {
    return this.opts.nativeTools.map((tool) => ({
      name: tool.name,
      summary: truncate(tool.description ?? '', 140),
      source: 'native',
    }))
  }

  private async buildComposioDescriptors(orgId: string): Promise<ToolDescriptor[]> {
    if (!isComposioEnabled()) return []
    const composio = getComposioClient()
    if (!composio) return []

    try {
      const accounts = await listConnectedAccounts(orgId)
      if (accounts.length === 0) return []

      const session = await composio.create(orgId)
      const tools = (await session.tools()) as Array<{
        name?: string
        description?: string
        function?: { name?: string; description?: string }
      }>

      const descriptors: ToolDescriptor[] = []
      for (const t of tools) {
        const name = t.name || t.function?.name
        const description = t.description || t.function?.description || ''
        if (!name) continue
        const provider = inferProviderFromToolName(name)
        descriptors.push({
          name: `composio.${name}`,
          summary: truncate(description, 140),
          source: 'composio',
          provider,
        })
      }
      return descriptors
    } catch (err) {
      logger.warn('[tool-catalog] composio descriptor load failed', {
        orgId,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  // ── Schema (on first tool_use) ───────────────────────────────────────────

  async loadSchema(name: string, orgId: string): Promise<Anthropic.Tool | null> {
    const cacheForOrg = this.getOrgSchemaCache(orgId)
    const cached = cacheForOrg.get(name)
    if (cached && Date.now() - cached.loadedAt < this.ttl) {
      return cached.tool
    }

    const tool = await this.fetchSchema(name, orgId)
    if (tool) {
      cacheForOrg.set(name, { tool, loadedAt: Date.now() })
    }
    return tool
  }

  private async fetchSchema(name: string, orgId: string): Promise<Anthropic.Tool | null> {
    // Native tools are pre-loaded.
    if (this.nativeToolIndex.has(name)) {
      return this.nativeToolIndex.get(name) ?? null
    }

    if (name.startsWith('composio.')) {
      return this.fetchComposioSchema(name.slice('composio.'.length), orgId)
    }

    return null
  }

  private async fetchComposioSchema(
    composioName: string,
    orgId: string,
  ): Promise<Anthropic.Tool | null> {
    if (!isComposioEnabled()) return null
    const composio = getComposioClient()
    if (!composio) return null

    try {
      const session = await composio.create(orgId)
      const tools = (await session.tools()) as Array<{
        name?: string
        description?: string
        inputSchema?: Record<string, unknown>
        input_schema?: Record<string, unknown>
        function?: {
          name?: string
          description?: string
          parameters?: Record<string, unknown>
        }
      }>
      const match = tools.find(
        (t) => (t.name || t.function?.name) === composioName,
      )
      if (!match) return null

      const rawSchema =
        match.inputSchema ||
        match.input_schema ||
        match.function?.parameters ||
        { type: 'object', properties: {} }

      return {
        name: `composio.${composioName}`,
        description: truncate(
          match.description || match.function?.description || '',
          1000,
        ),
        input_schema: rawSchema as Anthropic.Tool['input_schema'],
      }
    } catch (err) {
      logger.warn('[tool-catalog] composio schema load failed', {
        composioName,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────

  async dispatch(
    name: string,
    input: Record<string, unknown>,
    ctx: DispatchContext,
  ): Promise<ToolDispatchResult> {
    const nativeHandler = this.opts.nativeHandlers[name]
    if (nativeHandler) {
      return nativeHandler(input, ctx.orgId, ctx.supabase)
    }

    if (name.startsWith('composio.')) {
      return this.dispatchComposio(name.slice('composio.'.length), input, ctx.orgId)
    }

    return { success: false, error: `Unknown tool: ${name}` }
  }

  private async dispatchComposio(
    composioName: string,
    input: Record<string, unknown>,
    orgId: string,
  ): Promise<ToolDispatchResult> {
    if (!isComposioEnabled()) {
      return { success: false, error: 'Composio is not configured' }
    }
    const composio = getComposioClient()
    if (!composio) return { success: false, error: 'Composio client unavailable' }

    try {
      const result = await (composio as unknown as {
        tools: {
          execute: (opts: {
            actionName: string
            params: Record<string, unknown>
            entityId?: string
          }) => Promise<{ data?: unknown; error?: string; successfull?: boolean }>
        }
      }).tools.execute({
        actionName: composioName,
        params: input,
        entityId: orgId,
      })
      if (result.error || result.successfull === false) {
        return {
          success: false,
          error: `Action ${composioName} failed: ${result.error ?? 'unknown'}`,
        }
      }
      return { success: true, data: result.data }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // ── Cache helpers ────────────────────────────────────────────────────────

  private getOrgSchemaCache(orgId: string): Map<string, SchemaCacheEntry> {
    let entry = this.schemaCache.get(orgId)
    if (!entry) {
      entry = new Map()
      this.schemaCache.set(orgId, entry)
    }
    return entry
  }

  /** Test-only: drop all caches. */
  _resetForTest(): void {
    this.descriptorCache.clear()
    this.schemaCache.clear()
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

function inferProviderFromToolName(name: string): string | undefined {
  // Convention: Composio tool names are uppercase with underscore
  // prefixes like GMAIL_SEND_EMAIL. The first chunk is the toolkit.
  const upper = name.toUpperCase()
  const head = upper.split('_')[0]
  return head ? head.toLowerCase() : undefined
}

export { UnifiedToolCatalog as default }
export type { ToolDescriptor, ToolDispatchResult } from './descriptors'
