/**
 * mode-personas.ts — Per-mode agent persona configuration
 *
 * Each mode carries a persona that shapes the agent's system prompt and
 * retrieval behavior. The persona is a STATIC fragment appended to the
 * existing system prompt — no extra DB calls, no latency impact.
 *
 * Mode is a *prior*, not a wall:
 *   - retrievalBias weights mode-relevant namespaces higher
 *   - but does NOT exclude other namespaces
 *   - cross-mode questions (e.g. "what's my revenue?" in inbox) still work
 *
 * HIDE THE MACHINERY: These personas are never exposed to end users.
 * They modify agent behavior internally. No persona names, no tone labels.
 */

import type { Mode } from './mode-store'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RetrievalBias {
  /** Namespace tags to weight higher in RAG retrieval. Treated as a prior. */
  namespaces: string[]
  /** Weight multiplier (0–1) applied to matching namespace scores. Higher = stronger bias. */
  weight: number
}

export interface ModePersona {
  /**
   * Appended verbatim to the assembled system prompt.
   * Must be concise (< 200 tokens). No machinery references.
   */
  systemPromptFragment: string
  /**
   * Brief style instruction appended alongside fragment.
   * Applied after the base system prompt.
   */
  toneDirectives: string
  /** RAG namespace weighting — mode-relevant docs score higher. */
  retrievalBias: RetrievalBias
  /** Tools to surface first in suggestion UI (not enforced at engine level). */
  suggestedTools: string[]
}

// ─── Per-mode personas ────────────────────────────────────────────────────────

/**
 * PERSONAS: the four mode context primitives.
 *
 * Each fragment describes how BitBit should orient itself when the user
 * is in that workspace. Fragments are short, action-forward, and
 * never mention internal concepts (TAOR, persona, confidence scores).
 */
export const PERSONAS: Record<Mode, ModePersona> = {
  chat: {
    systemPromptFragment:
      "We're in an open conversation. Think broadly across all connected data — messages, tasks, contacts, finances, and memory. Be exploratory and reflective. Surface connections the user might not have considered. There's no single domain in focus; follow the thread wherever it leads.",
    toneDirectives:
      'Conversational and thoughtful. Match the energy of the message — quick questions get quick answers, nuanced questions get depth.',
    retrievalBias: {
      namespaces: ['memory', 'conversation', 'contact', 'activity'],
      weight: 0.6,
    },
    suggestedTools: ['search_memory', 'find_messages', 'search_contacts', 'web_search'],
  },

  inbox: {
    systemPromptFragment:
      "We're working through messages and communications. Triage aggressively: identify what needs a decision, what's noise, and what's time-sensitive. For each message or thread, lean toward recommending a clear action (reply, archive, approve, forward, snooze). Surface the most urgent items first regardless of channel.",
    toneDirectives:
      'Direct and decisive. Name the action. Short sentences. If something needs a reply, draft it.',
    retrievalBias: {
      namespaces: ['message', 'thread', 'approval', 'inbox', 'channel'],
      weight: 0.85,
    },
    suggestedTools: ['find_messages', 'read_message', 'send_email', 'send_imessage', 'search_contacts'],
  },

  work: {
    systemPromptFragment:
      "We're executing on work — tasks, projects, leads, and meetings. Be time-aware: check what's due today, what's overdue, and what's blocking progress. For any request about work status, check the actual task board before responding. Prioritise by deadline and dependency. When there's a next action, take it.",
    toneDirectives:
      'Execution-focused. Lead with status, then action. Use bullet lists for multi-item status. Be crisp about blockers.',
    retrievalBias: {
      namespaces: ['task', 'project', 'meeting', 'lead', 'contact', 'activity'],
      weight: 0.8,
    },
    suggestedTools: ['get_tasks', 'create_task', 'update_task', 'search_contacts', 'find_messages'],
  },

  money: {
    systemPromptFragment:
      "We're in the financial workspace. Be numerically precise: lead with figures, totals, and cash-flow status. For invoices, state the amount, client, due date, and payment status. For questions about revenue or costs, query the actual data before answering. Overdue invoices and failed payments get priority.",
    toneDirectives:
      'Numeric and precise. Lead with the number. Use totals. State currency. Flag overdue items first.',
    retrievalBias: {
      namespaces: ['invoice', 'payment', 'cost', 'revenue', 'client', 'billing'],
      weight: 0.85,
    },
    suggestedTools: ['generate_invoice', 'list_invoices', 'search_contacts', 'execute_code'],
  },
}

/**
 * DEFAULT_PERSONA — used when the dashboard mode feature flag is off
 * or when currentMode is undefined/invalid. Applies no bias; falls back
 * to the base system prompt unchanged.
 */
export const DEFAULT_PERSONA: ModePersona = {
  systemPromptFragment: '',
  toneDirectives: '',
  retrievalBias: {
    namespaces: [],
    weight: 0.5,
  },
  suggestedTools: [],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_MODES: ReadonlySet<string> = new Set(['chat', 'inbox', 'work', 'money'])

/**
 * Resolve the persona for a given mode, falling back to DEFAULT_PERSONA
 * when mode is undefined or invalid.
 */
export function resolvePersona(mode: Mode | string | undefined | null): ModePersona {
  if (!mode || !VALID_MODES.has(mode)) return DEFAULT_PERSONA
  return PERSONAS[mode as Mode]
}

/**
 * Append the mode persona fragment and tone directives to the base system prompt.
 *
 * - Mode is a *prior*, not a wall. The existing prompt is preserved in full.
 * - If mode is undefined or DEFAULT_PERSONA has empty fragment, returns basePrompt unchanged.
 * - No round-trips, no DB calls — purely string concatenation.
 *
 * Latency budget: O(1) string append. Zero extra I/O.
 */
export function applyModePersona(basePrompt: string, mode: Mode | string | undefined | null): string {
  const persona = resolvePersona(mode)

  // DEFAULT_PERSONA has empty fragment — return base prompt unchanged
  if (!persona.systemPromptFragment) return basePrompt

  const lines: string[] = [
    basePrompt,
    '',
    '## Current Context',
    '',
    persona.systemPromptFragment,
  ]

  if (persona.toneDirectives) {
    lines.push('', persona.toneDirectives)
  }

  return lines.join('\n')
}

/**
 * Get retrieval bias for a given mode.
 * Returns DEFAULT_PERSONA bias when mode is missing/invalid.
 */
export function getRetrievalBias(mode: Mode | string | undefined | null): RetrievalBias {
  return resolvePersona(mode).retrievalBias
}
