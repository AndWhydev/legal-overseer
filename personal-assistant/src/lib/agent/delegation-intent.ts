import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DelegationIntentType = 'activate' | 'revoke'

export interface DelegationIntent {
  type: DelegationIntentType
  entityMention: string
  confidence: number
}

// ---------------------------------------------------------------------------
// Activation patterns — user wants BitBit to take over an entity
// ---------------------------------------------------------------------------

export const ACTIVATION_PATTERNS: RegExp[] = [
  /\btake\s+(.+?)\s+off\s+my\s+hands?\b/i,
  /\bmanage\s+(.+?)\s+for\s+me\b/i,
  /\bput\s+(.+?)\s+on\s+autopilot\b/i,
  /\bhandle\s+(.+?)\s+(?:from now on|going forward|for me)\b/i,
  /\btake\s+(?:over|charge of)\s+(.+?)(?:\s+for\s+me)?\s*$/i,
  /\brun\s+(.+?)\s+on\s+autopilot\b/i,
  /\bauto(?:mate|pilot)\s+(.+?)$/i,
  /\bdelegate\s+(.+?)\s+to\s+(?:you|bitbit)\b/i,
  /\byou\s+(?:deal|handle)\s+(?:with\s+)?(.+?)(?:\s+from now on)?\s*$/i,
]

// ---------------------------------------------------------------------------
// Revocation patterns — user wants to take back control
// ---------------------------------------------------------------------------

export const REVOCATION_PATTERNS: RegExp[] = [
  /\bstop\s+managing\s+(.+?)$/i,
  /\btake\s+(.+?)\s+back\b/i,
  /\brevoke\s+(?:delegation|mandate)\s+(?:for\s+)?(.+?)$/i,
  /\bstop\s+(?:handling|automating|running)\s+(.+?)$/i,
  /\bi(?:'ll|'ll| will)\s+(?:handle|manage|take care of)\s+(.+?)\s+(?:myself|again)\b/i,
  /\bcancel\s+(?:delegation|autopilot)\s+(?:for|on)\s+(.+?)$/i,
  /\btake\s+(.+?)\s+off\s+autopilot\b/i,
  /\bgive\s+(?:me\s+)?(.+?)\s+back\b/i,
  /\bno\s+(?:longer|more)\s+(?:manage|handle|automate)\s+(.+?)$/i,
]

// ---------------------------------------------------------------------------
// detectDelegationIntent — regex pattern matching on user message
// ---------------------------------------------------------------------------

export function detectDelegationIntent(message: string): DelegationIntent | null {
  const trimmed = message.trim()

  // Check activation patterns first
  for (const pattern of ACTIVATION_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match && match[1]) {
      const entityMention = cleanEntityMention(match[1])
      if (!entityMention) continue
      return {
        type: 'activate',
        entityMention,
        confidence: computeConfidence(trimmed, entityMention, 'activate'),
      }
    }
  }

  // Check revocation patterns
  for (const pattern of REVOCATION_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match && match[1]) {
      const entityMention = cleanEntityMention(match[1])
      if (!entityMention) continue
      return {
        type: 'revoke',
        entityMention,
        confidence: computeConfidence(trimmed, entityMention, 'revoke'),
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// cleanEntityMention — strip noise from captured group
// ---------------------------------------------------------------------------

function cleanEntityMention(raw: string): string {
  return raw
    .replace(/[?.!,;]+$/, '')
    .replace(/^(?:the|my|our|this)\s+/i, '')
    .trim()
}

// ---------------------------------------------------------------------------
// computeConfidence — heuristic score 0-1
// ---------------------------------------------------------------------------

function computeConfidence(
  message: string,
  entityMention: string,
  type: DelegationIntentType,
): number {
  let score = 0.7 // base score for regex match

  // Boost: short, direct commands are higher confidence
  if (message.split(/\s+/).length <= 8) score += 0.1

  // Boost: entity mention looks like a proper name (capitalized)
  if (/^[A-Z]/.test(entityMention)) score += 0.1

  // Boost: explicit keywords that reinforce intent
  if (type === 'activate' && /autopilot|delegate/i.test(message)) score += 0.05
  if (type === 'revoke' && /revoke|cancel|stop/i.test(message)) score += 0.05

  // Penalize: very long messages are probably more nuanced
  if (message.length > 200) score -= 0.15

  return Math.min(1.0, Math.max(0.0, parseFloat(score.toFixed(2))))
}

// ---------------------------------------------------------------------------
// resolveEntityFromMention — look up entity_nodes by name/alias
// ---------------------------------------------------------------------------

export async function resolveEntityFromMention(
  supabase: SupabaseClient,
  orgId: string,
  mention: string,
): Promise<{ id: string; name: string } | null> {
  const normalised = mention.toLowerCase().trim()

  // 1. Exact name match
  const { data: exactMatch, error: exactErr } = await supabase
    .from('entity_nodes')
    .select('id, name')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .ilike('name', normalised)
    .limit(1)
    .maybeSingle()

  if (exactErr && exactErr.code !== 'PGRST116') {
    logger.warn('[delegation-intent] exact lookup failed', {
      error: exactErr.message,
      mention,
    })
  }

  if (exactMatch) {
    return { id: exactMatch.id, name: exactMatch.name }
  }

  // 2. Alias array contains the mention
  const { data: aliasMatch, error: aliasErr } = await supabase
    .from('entity_nodes')
    .select('id, name')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .contains('aliases', [normalised])
    .limit(1)
    .maybeSingle()

  if (aliasErr && aliasErr.code !== 'PGRST116') {
    logger.warn('[delegation-intent] alias lookup failed', {
      error: aliasErr.message,
      mention,
    })
  }

  if (aliasMatch) {
    return { id: aliasMatch.id, name: aliasMatch.name }
  }

  // 3. Fuzzy: name starts with the mention (prefix match)
  const { data: fuzzyMatch, error: fuzzyErr } = await supabase
    .from('entity_nodes')
    .select('id, name')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .ilike('name', `${normalised}%`)
    .limit(1)
    .maybeSingle()

  if (fuzzyErr && fuzzyErr.code !== 'PGRST116') {
    logger.warn('[delegation-intent] fuzzy lookup failed', {
      error: fuzzyErr.message,
      mention,
    })
  }

  if (fuzzyMatch) {
    return { id: fuzzyMatch.id, name: fuzzyMatch.name }
  }

  return null
}

// ---------------------------------------------------------------------------
// Confirmation message generators
// ---------------------------------------------------------------------------

export function generateActivationConfirmation(entityName: string): string {
  return (
    `Got it — I'll take over managing ${entityName} from here. ` +
    `I'll handle their messages, follow up on outstanding items, and keep you posted ` +
    `on anything important. You can say "stop managing ${entityName}" any time to take back control.`
  )
}

export function generateRevocationConfirmation(entityName: string): string {
  return (
    `Understood — I've stepped back from managing ${entityName}. ` +
    `You're back in the driver's seat. Their messages will come through to you directly now.`
  )
}
