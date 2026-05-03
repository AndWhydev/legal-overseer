/**
 * mode-eval-dataset.ts — Seed eval cases per mode.
 *
 * 12 reference cases (3 per mode) the eval driver can replay against a
 * candidate model build. Each case names the dimensions it should be scored
 * on, so the rubric in `mode-eval-rubric.ts` can produce a per-case verdict
 * even when the dimensions deviate from a mode's default set.
 *
 * The seed dataset is intentionally tiny. Real coverage comes from
 * production traces curated by the eval driver — this file's job is to
 * make every mode + dimension reachable from day one.
 *
 * NOTE on scope: cases are static fixtures. The harness that runs candidates
 * against them (model-under-test invocation, judge prompts, result
 * persistence) is out-of-scope and lands in a follow-up PR.
 */

import type { Mode } from '@/lib/dashboard/mode-store'
import type { EvalDimension } from './mode-eval-rubric'
import { MODE_RUBRICS } from './mode-eval-rubric'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvalCase {
  /** Stable id. Used for result persistence + telemetry. */
  id: string
  mode: Mode
  /** What the user (or upstream pipeline) gave the assistant. */
  input: string
  /**
   * Plain-English description of what a correct response looks like. The
   * judge prompt will be derived from this — keep it specific and testable.
   */
  expectedBehavior: string
  /** Dimensions this case is scored on. May expand the mode's default set. */
  dimensions: ReadonlyArray<EvalDimension>
}

// ─── Seed dataset ─────────────────────────────────────────────────────────────

export const SEED_DATASET: ReadonlyArray<EvalCase> = [
  // chat
  {
    id: 'chat-001-todays-overview',
    mode: 'chat',
    input: "What's on today?",
    expectedBehavior:
      'Synthesises a per-mode summary (chat/inbox/work/money) drawing on the daily briefing. Uses calm, concrete language. Does not list TAOR, confidence scores, or other internal machinery.',
    dimensions: ['helpfulness', 'conversational_tone'],
  },
  {
    id: 'chat-002-clarification',
    mode: 'chat',
    input: 'Send Jane the thing.',
    expectedBehavior:
      'Asks one clarifying question (which Jane, which thing) instead of acting on ambiguous input. Keeps the question short and friendly.',
    dimensions: ['helpfulness', 'conversational_tone'],
  },
  {
    id: 'chat-003-handoff-not-yet',
    mode: 'chat',
    input: 'Can you handle invoicing for me?',
    expectedBehavior:
      'Acknowledges money-mode capabilities at a high level and offers to start an invoice. Does not promise features that depend on plan tier without checking.',
    dimensions: ['helpfulness', 'conversational_tone'],
  },

  // inbox
  {
    id: 'inbox-001-missed-payment-routing',
    mode: 'inbox',
    input:
      'Email subject: "Invoice INV-104 — second reminder, 14 days overdue". Sender: hello@acme-corp.com.',
    expectedBehavior:
      'Classifies as a money-mode item (overdue invoice). Marks urgency high. Suggests "Send to → Money" rather than archiving.',
    dimensions: ['triage_accuracy', 'urgency_calibration'],
  },
  {
    id: 'inbox-002-newsletter-low',
    mode: 'inbox',
    input: 'Email from a marketing newsletter the user skims monthly. Subject: "Weekly digest #42".',
    expectedBehavior:
      'Classifies as low-urgency informational. Does not surface as actionable. Safe to auto-archive after retention window.',
    dimensions: ['triage_accuracy', 'urgency_calibration'],
  },
  {
    id: 'inbox-003-task-bearing-message',
    mode: 'inbox',
    input:
      'WhatsApp from a client: "Can you have the draft for the brochure to me by Thursday end of day?"',
    expectedBehavior:
      'Recognises a task-bearing message. Suggests "Send to → Work" with due date Thursday EOD inferred from the message.',
    dimensions: ['triage_accuracy', 'urgency_calibration', 'task_extraction', 'due_date_inference'],
  },

  // work
  {
    id: 'work-001-dictated-task',
    mode: 'work',
    input: "Remind me to follow up with Sarah Friday about the Q3 numbers.",
    expectedBehavior:
      'Creates a single task. Title references Sarah + Q3 numbers. Due date set to the next Friday in the user\'s timezone.',
    dimensions: ['task_extraction', 'due_date_inference'],
  },
  {
    id: 'work-002-multi-task-split',
    mode: 'work',
    input: 'I need to: finalise the slide deck, book the venue, and email the speakers.',
    expectedBehavior:
      'Creates three separate tasks, not one. No due dates inferred — none were given. Tasks are titled in the imperative ("Finalise slide deck", etc.).',
    dimensions: ['task_extraction'],
  },
  {
    id: 'work-003-relative-date',
    mode: 'work',
    input: "Take a look at the contract sometime next week.",
    expectedBehavior:
      'Creates one task with a soft due date in the next ISO week (any weekday Mon-Fri is acceptable). Does not pick today or "today + 7 days" naively.',
    dimensions: ['task_extraction', 'due_date_inference'],
  },

  // money
  {
    id: 'money-001-invoice-from-thread',
    mode: 'money',
    input:
      'Chat thread with Acme: "Final cost was 2,400 plus the 240 expense, all in AUD. Please invoice."',
    expectedBehavior:
      'Generates a draft invoice for AUD 2,640.00 to Acme. Subtotal lines preserve the 2,400 + 240 split. Currency code AUD on the invoice header.',
    dimensions: ['numeric_correctness', 'currency_handling'],
  },
  {
    id: 'money-002-tax-rounding',
    mode: 'money',
    input: 'Invoice for AUD 1,000 net + 10% GST.',
    expectedBehavior:
      'Subtotal AUD 1,000.00, GST line AUD 100.00, total AUD 1,100.00. No floating-point artifacts (e.g. 1099.99). All amounts rendered with two decimals.',
    dimensions: ['numeric_correctness', 'currency_handling'],
  },
  {
    id: 'money-003-foreign-currency-flag',
    mode: 'money',
    input: 'A US client wants to pay in USD. Invoice them USD 500.',
    expectedBehavior:
      'Header currency is USD, not AUD. The amount is rendered as USD 500.00. Does not silently convert to AUD without being asked.',
    dimensions: ['numeric_correctness', 'currency_handling'],
  },
]

// ─── Public API ───────────────────────────────────────────────────────────────

export function getCasesByMode(mode: Mode): EvalCase[] {
  return SEED_DATASET.filter(c => c.mode === mode)
}

export function getCasesByDimension(dimension: EvalDimension): EvalCase[] {
  return SEED_DATASET.filter(c => c.dimensions.includes(dimension))
}

export function getCaseById(id: string): EvalCase | undefined {
  return SEED_DATASET.find(c => c.id === id)
}

/**
 * Cross-validation helper: every dimension a case claims to score on is
 * either the mode's default or an explicit expansion. Returns the cases
 * that EXPAND beyond their mode's defaults — useful for documentation.
 */
export function getCrossModeCases(): EvalCase[] {
  return SEED_DATASET.filter(c => {
    const defaults = new Set<EvalDimension>(MODE_RUBRICS[c.mode].dimensions)
    return c.dimensions.some(d => !defaults.has(d))
  })
}
