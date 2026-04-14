/**
 * Bridge between the existing `TOOL_GROUPS` / `allHandlers` surface in
 * src/lib/agent/tools.ts and the new `UnifiedToolCatalog`.
 *
 * Call `createUnifiedCatalog()` at the start of an agent session to
 * build a catalog that can:
 *   - emit lightweight descriptors for the system prompt (saves tokens)
 *   - lazily load the full JSON schema when the model picks a tool
 *   - dispatch to either the native handler or Composio via a single
 *     name-based router
 *
 * The legacy path (`getAgentTools` + `allHandlers` loop) keeps working
 * unchanged — this is opt-in behind `UNIFIED_TOOLS=true`.
 */
import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

import { UnifiedToolCatalog, type ToolDispatchResult } from './index'

export type LegacyAgentToolHandler = (
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
) => Promise<{ success: boolean; data?: unknown; error?: string }>

export interface UnifiedCatalogInput {
  nativeTools: Anthropic.Tool[]
  nativeHandlers: Record<string, LegacyAgentToolHandler>
}

export function createUnifiedCatalog(input: UnifiedCatalogInput): UnifiedToolCatalog {
  const normalisedHandlers: Record<
    string,
    (i: Record<string, unknown>, o: string, s: SupabaseClient) => Promise<ToolDispatchResult>
  > = {}

  for (const [name, handler] of Object.entries(input.nativeHandlers)) {
    normalisedHandlers[name] = async (i, o, s) => {
      const result = await handler(i, o, s)
      if (result.success) {
        return { success: true, data: result.data }
      }
      return { success: false, error: result.error ?? 'unknown error' }
    }
  }

  return new UnifiedToolCatalog({
    nativeTools: input.nativeTools,
    nativeHandlers: normalisedHandlers,
  })
}

/**
 * Is the unified tool catalog enabled for this org?
 *
 * Precedence (first match wins):
 *   1. Explicit per-org opt-in via `enabled_modules` containing
 *      `unified-tools` — lets us pilot on specific orgs via a SQL
 *      update while the env flag stays off.
 *   2. Global env flag `UNIFIED_TOOLS=true` (staging / rollout flip).
 *
 * Returns false synchronously when no org context is available so the
 * default agent path is used.
 */
export function isUnifiedToolsEnabled(opts?: {
  orgEnabledModules?: string[] | null
}): boolean {
  if (opts?.orgEnabledModules?.includes('unified-tools')) return true
  return process.env.UNIFIED_TOOLS === 'true'
}
