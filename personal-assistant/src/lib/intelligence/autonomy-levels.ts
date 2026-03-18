/**
 * Autonomy Levels — risk-based pre-filter for agent tool execution.
 *
 * L4 (Act Silently)   — Read-only / low-risk. Execute without asking. Activity log only.
 * L3 (Act + Notify)   — Write but reversible / low-stakes. Execute and notify user.
 * L2 (Propose First)  — Consequential outbound. Propose via whisper, wait for confirmation.
 * L1 (Always Ask)     — Financial / irreversible. Always require explicit approval.
 *
 * The autonomy level acts as a pre-filter BEFORE the confidence router.
 * L4/L3 tools bypass the approval queue entirely; L2/L1 fall through to existing routing.
 */

import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AutonomyLevel = 'L4_silent' | 'L3_notify' | 'L2_propose' | 'L1_approve'

export interface AutonomyDecision {
  execute: boolean
  notify: boolean
  reason: string
}

export interface OrgAutonomyOverrides {
  autonomy_overrides?: Record<string, AutonomyLevel>
}

// ---------------------------------------------------------------------------
// Tool → Autonomy mapping
// ---------------------------------------------------------------------------

export const TOOL_AUTONOMY_MAP: Record<string, AutonomyLevel> = {
  // L4: Read-only and low-risk — execute silently
  search_memory: 'L4_silent',
  find_messages: 'L4_silent',
  search_contacts: 'L4_silent',
  get_contact: 'L4_silent',
  search_tasks: 'L4_silent',
  web_search: 'L4_silent',
  fetch_url: 'L4_silent',
  browse_website: 'L4_silent',
  get_upcoming: 'L4_silent',
  summarize_inbox: 'L4_silent',
  read_message: 'L4_silent',

  // L3: Write operations, reversible or low-stakes — execute and notify
  create_task: 'L3_notify',
  update_task: 'L3_notify',
  log_activity: 'L3_notify',
  add_memory: 'L3_notify',
  create_reminder: 'L3_notify',
  schedule_event: 'L3_notify',
  draft_reply: 'L3_notify',
  compose_creator_notification_mockup: 'L3_notify',
  execute_code: 'L3_notify',

  // L2: Consequential outbound — propose first, wait for confirmation
  send_email: 'L2_propose',
  send_sms: 'L2_propose',
  send_whatsapp: 'L2_propose',
  send_gmail: 'L2_propose',
  send_outlook: 'L2_propose',
  approve_action: 'L2_propose',

  // Ad Script tools: generate content internally, no external side effects
  generate_ad_scripts: 'L3_notify',   // Creates scripts, saves to DB
  list_ad_batches: 'L4_silent',       // Read-only query
  adapt_script: 'L4_silent',          // Pure transformation, no DB write

  // L1: Financial / irreversible — always require approval
  // (future: invoice_send, payment_process, contract_sign)
}

/** Safe default for unknown tools — treat as consequential until classified. */
const DEFAULT_AUTONOMY: AutonomyLevel = 'L2_propose'

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Get the autonomy level for a tool, with optional per-org overrides.
 */
export function getAutonomyLevel(
  toolName: string,
  orgOverrides?: OrgAutonomyOverrides | null,
): AutonomyLevel {
  // Org overrides take precedence
  const override = orgOverrides?.autonomy_overrides?.[toolName]
  if (override) {
    // Validate the override is a real level
    const valid: AutonomyLevel[] = ['L4_silent', 'L3_notify', 'L2_propose', 'L1_approve']
    if (valid.includes(override)) {
      return override
    }
    logger.warn(`[autonomy] Invalid org override for tool "${toolName}": ${override}. Ignoring.`)
  }

  return TOOL_AUTONOMY_MAP[toolName] ?? DEFAULT_AUTONOMY
}

/**
 * Decide whether a tool should auto-execute based on its autonomy level
 * and the caller's confidence score.
 *
 *  - L4: always execute, no notification
 *  - L3: execute if confidence > 0.5, always notify
 *  - L2: execute only if confidence exceeds the act threshold AND auto-send is enabled
 *        (in practice, L2 falls through to the existing confidence router)
 *  - L1: never auto-execute
 */
export function shouldAutoExecute(
  toolName: string,
  confidenceScore: number,
  orgOverrides?: OrgAutonomyOverrides | null,
): AutonomyDecision {
  const level = getAutonomyLevel(toolName, orgOverrides)

  switch (level) {
    case 'L4_silent':
      return {
        execute: true,
        notify: false,
        reason: `L4 (silent): "${toolName}" is read-only / low-risk — auto-executing`,
      }

    case 'L3_notify':
      if (confidenceScore > 0.5) {
        return {
          execute: true,
          notify: true,
          reason: `L3 (notify): "${toolName}" is reversible — auto-executing (confidence ${confidenceScore.toFixed(2)} > 0.5)`,
        }
      }
      return {
        execute: false,
        notify: true,
        reason: `L3 (notify): "${toolName}" confidence too low (${confidenceScore.toFixed(2)} <= 0.5) — deferring to approval`,
      }

    case 'L2_propose':
      // L2 never auto-executes from this function.
      // The caller should fall through to the confidence router + approval queue.
      return {
        execute: false,
        notify: true,
        reason: `L2 (propose): "${toolName}" is consequential — requires confidence routing + approval`,
      }

    case 'L1_approve':
      return {
        execute: false,
        notify: true,
        reason: `L1 (approve): "${toolName}" is financial/irreversible — always requires explicit approval`,
      }
  }
}
