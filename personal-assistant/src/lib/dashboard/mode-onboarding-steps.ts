/**
 * mode-onboarding-steps.ts — Per-mode onboarding step registry.
 *
 * Each dashboard mode has a different "first useful thing" the user should do.
 * Chat works without setup (just ask a question). Inbox needs a connected
 * channel before it has anything to triage. Work needs a first task on the
 * board. Money needs a contact + invoice draft before the tab feels alive.
 *
 * One generic onboarding wizard would either over-prompt (asking money users
 * to connect WhatsApp) or under-prompt (dropping inbox users into an empty
 * tab). This registry encodes the per-mode funnel so the next-step UI knows
 * what to ask for, in what order, and when to stop.
 *
 * "Mode is a prior, not a wall": the onboarding nudges the user toward the
 * mode they landed on, but doesn't lock them out of the others. Required
 * steps gate the *primary* affordance of a mode, not dashboard access.
 *
 * NOTE on scope: this is the data + state primitive. The actual onboarding
 * UI components, step renderers, and analytics wiring (PostHog event names,
 * funnel dashboards) are out-of-scope and land in follow-up PRs.
 */

import type { Mode } from './mode-store'

// ─── Types ────────────────────────────────────────────────────────────────────

export type OnboardingStepKind =
  | 'instruction'
  | 'connect-channel'
  | 'create-task'
  | 'add-contact'
  | 'create-invoice'

/**
 * Discriminated union of side effects a step CTA can request.
 *
 * The step registry declares the *intent* (switch to a tab, open a modal,
 * focus an input). The shell layer in `spa-shell.tsx` interprets the
 * intent and calls the matching imperative — `setActiveMode`,
 * `handleTabChange`, etc. — and connect-channel sheets land in a
 * follow-up PR with their own routing logic.
 *
 * Foundation only: kinds are deliberately conservative. Adding new ones
 * is fine; do NOT smuggle business state into `payload` (e.g. partial
 * task content). Steps are *intents*, not draft data.
 */
export type OnboardingStepAction =
  /** Switch the active dashboard mode. */
  | { kind: 'switch-mode'; mode: Mode }
  /** Switch the active SPA tab inside the current mode. */
  | { kind: 'switch-tab'; tabId: string }
  /** Open a named UI modal/sheet. The shell decides which one. */
  | { kind: 'open-modal'; modalId: string }
  /** No automatic side effect — completing the step is the only outcome. */
  | { kind: 'noop' }

export interface OnboardingStep {
  id: string
  mode: Mode
  /** 1-indexed position within the mode's funnel. */
  order: number
  title: string
  description: string
  kind: OnboardingStepKind
  /**
   * If true, the mode is not "onboarded" until this step is complete.
   * Optional steps (chat's "ask a question") count toward progress but
   * don't gate completion.
   */
  required: boolean
  ctaLabel: string
  /**
   * Optional side-effect intent fired before `completeStep`. Defaults to
   * `{ kind: 'noop' }` when omitted, so existing seed steps keep their
   * original behavior. Wire intents into a step gradually as the destination
   * UI lands.
   */
  action?: OnboardingStepAction
}

// ─── Steps ────────────────────────────────────────────────────────────────────

/**
 * The ordered funnel for every mode. Listed top-down in canonical
 * chat → inbox → work → money order. Step ids must remain stable (they
 * persist into localStorage as the "completed" record).
 */
export const MODE_ONBOARDING_STEPS: ReadonlyArray<OnboardingStep> = [
  // chat — zero setup; the step exists so progress can be tracked
  {
    id: 'chat-1-ask-first-question',
    mode: 'chat',
    order: 1,
    title: 'Ask BitBit your first question',
    description: 'Try "what\'s on today?" or anything you\'d normally Google.',
    kind: 'instruction',
    required: false,
    ctaLabel: 'Open chat',
    action: { kind: 'switch-mode', mode: 'chat' },
  },

  // inbox — connect a source so there is anything to triage
  {
    id: 'inbox-1-connect-channel',
    mode: 'inbox',
    order: 1,
    title: 'Connect a channel',
    description: 'Pick at least one of email, WhatsApp, or iMessage so BitBit can see your inbox.',
    kind: 'connect-channel',
    required: true,
    ctaLabel: 'Connect',
    action: { kind: 'open-modal', modalId: 'connect-channel' },
  },
  {
    id: 'inbox-2-send-test-message',
    mode: 'inbox',
    order: 2,
    title: 'Send yourself a test message',
    description: 'Confirm the connection by sending a short message to yourself on the connected channel.',
    kind: 'instruction',
    required: false,
    ctaLabel: 'Got it',
  },

  // work — capture a task, then see it surface on the board
  {
    id: 'work-1-capture-first-task',
    mode: 'work',
    order: 1,
    title: 'Capture your first task',
    description: 'Dictate or type a task. "Remind me to..." or "I need to..." both work.',
    kind: 'create-task',
    required: true,
    ctaLabel: 'Add task',
  },
  {
    id: 'work-2-see-it-on-board',
    mode: 'work',
    order: 2,
    title: 'See it on the work board',
    description: 'Switch to the Work tab — your task is there, organised by due date.',
    kind: 'instruction',
    required: false,
    ctaLabel: 'Open Work',
    action: { kind: 'switch-mode', mode: 'work' },
  },

  // money — three steps because money mode has the steepest setup curve
  {
    id: 'money-1-add-contact',
    mode: 'money',
    order: 1,
    title: 'Add your first contact',
    description: 'Add a client (name + email is enough). Invoices are scoped to a contact.',
    kind: 'add-contact',
    required: true,
    ctaLabel: 'Add contact',
  },
  {
    id: 'money-2-create-invoice-draft',
    mode: 'money',
    order: 2,
    title: 'Create an invoice draft',
    description: 'Draft an invoice for the contact you just added. You can fill in real numbers later.',
    kind: 'create-invoice',
    required: true,
    ctaLabel: 'Draft invoice',
  },
  {
    id: 'money-3-see-it-in-money-tab',
    mode: 'money',
    order: 3,
    title: 'See it in the Money tab',
    description: 'Switch to Money — your draft is sitting there, ready to send when you are.',
    kind: 'instruction',
    required: false,
    ctaLabel: 'Open Money',
    action: { kind: 'switch-mode', mode: 'money' },
  },
]

// ─── Public API ───────────────────────────────────────────────────────────────

/** Steps for a mode in funnel order. */
export function getStepsForMode(mode: Mode): OnboardingStep[] {
  return MODE_ONBOARDING_STEPS
    .filter(s => s.mode === mode)
    .slice()
    .sort((a, b) => a.order - b.order)
}

/**
 * The next step a user should see for a mode given the steps they've already
 * completed. Returns null when every step in the funnel is done.
 */
export function getNextStep(mode: Mode, completedStepIds: ReadonlyArray<string>): OnboardingStep | null {
  const completed = new Set(completedStepIds)
  const steps = getStepsForMode(mode)
  for (const step of steps) {
    if (!completed.has(step.id)) return step
  }
  return null
}

/**
 * True when every *required* step for the mode is in the completed set.
 * Optional steps don't gate completion — a chat user is "onboarded" the
 * moment they open the dashboard.
 */
export function isModeOnboardingComplete(mode: Mode, completedStepIds: ReadonlyArray<string>): boolean {
  const completed = new Set(completedStepIds)
  return getStepsForMode(mode)
    .filter(s => s.required)
    .every(s => completed.has(s.id))
}

export interface OnboardingProgress {
  completed: number
  total: number
  /** 0-100, rounded. Returns 100 when the mode has no steps. */
  percent: number
}

export function getOnboardingProgress(mode: Mode, completedStepIds: ReadonlyArray<string>): OnboardingProgress {
  const completed = new Set(completedStepIds)
  const steps = getStepsForMode(mode)
  if (steps.length === 0) return { completed: 0, total: 0, percent: 100 }
  const done = steps.filter(s => completed.has(s.id)).length
  return {
    completed: done,
    total: steps.length,
    percent: Math.round((done / steps.length) * 100),
  }
}

/** Look up a step by id. Returns undefined when missing. */
export function findOnboardingStep(id: string): OnboardingStep | undefined {
  return MODE_ONBOARDING_STEPS.find(s => s.id === id)
}
