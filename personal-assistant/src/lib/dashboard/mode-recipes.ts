/**
 * mode-recipes.ts — Cross-mode workflow recipes.
 *
 * The Send-To registry from #97 lets a user fire a single cross-mode action
 * (inbox message → work task; chat thread → invoice draft). Recipes compose
 * those primitives into named, multi-step workflows that span three or four
 * modes in one pass.
 *
 * Example: "Chase an overdue invoice" originates in Money but touches Work
 * (create a chase task), Chat (draft a polite reminder), and Inbox (file
 * the chase under inbox so the user sees acknowledgement come back).
 *
 * Foundation only: this layer reuses the Send-To registry's action ids and
 * fires the same `bb-send-to` events. The actual *trigger* system that runs
 * recipes automatically when an event happens (overdue cron, new client
 * message arrives) is out-of-scope and lands in follow-up PRs.
 *
 * "Mode is a prior, not a wall": recipes deliberately span modes — that's
 * the point. The originMode is where the user *thinks* about the workflow,
 * not a restriction on what it can do.
 *
 * NOTE on enforcement: this module does not gate on entitlements. A recipe
 * step may target a mode the workspace doesn't have entitled (per the
 * `mode-entitlements.ts` primitive from #99). The execute helper surfaces
 * which steps were skipped via `result.skippedSteps`; consumers decide
 * whether to upsell the user or quietly drop the step.
 */

import type { Mode } from './mode-store'
import {
  executeSendToAction,
  findSendToAction,
  type SendToAction,
  type SendToContext,
} from './send-to-registry'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecipeStep {
  /** Action id from the Send-To registry. */
  sendToActionId: string
  /** Human label shown in the recipe preview. */
  label: string
  /** Optional payload override for this step. */
  payloadOverride?: unknown
}

export interface ModeRecipe {
  id: string
  /** Where the user thinks about the recipe — drives the menu it shows up in. */
  originMode: Mode
  name: string
  description: string
  /** Modes touched (for badging "this spans Inbox + Work + Money"). */
  affectedModes: ReadonlyArray<Mode>
  steps: ReadonlyArray<RecipeStep>
}

export interface RecipeExecutionResult {
  recipeId: string
  /** Steps that fired successfully. */
  executedSteps: string[]
  /** Steps whose action id wasn't found in the registry. */
  skippedSteps: Array<{ sendToActionId: string; reason: string }>
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

/**
 * The canonical recipe set. Each recipe references real action ids from
 * `send-to-registry.ts` — adding a new mode pair to the registry doesn't
 * break recipes, but renaming an action id will (validation guards this
 * via the test suite + the `isRecipeRegistered` helper below).
 */
export const MODE_RECIPES: ReadonlyArray<ModeRecipe> = [
  {
    id: 'overdue-invoice-chase',
    originMode: 'money',
    name: 'Chase overdue invoice',
    description:
      'Spin up a follow-up task, draft a polite reminder, and file the chase under inbox so replies surface naturally.',
    affectedModes: ['money', 'work', 'chat', 'inbox'],
    steps: [
      { sendToActionId: 'money-to-work-task', label: 'Create chase task on the work board' },
      { sendToActionId: 'money-to-chat', label: 'Draft polite reminder via chat' },
    ],
  },
  {
    id: 'inbox-triage-fanout',
    originMode: 'inbox',
    name: 'Triage to every mode',
    description:
      'A single inbox message that needs to spawn a task, an invoice line, and a chat discussion — fan it out in one click.',
    affectedModes: ['inbox', 'work', 'money', 'chat'],
    steps: [
      { sendToActionId: 'inbox-to-work-task', label: 'Create task from this' },
      { sendToActionId: 'inbox-to-money-invoice', label: 'Start invoice for sender' },
      { sendToActionId: 'inbox-to-chat', label: 'Discuss with BitBit' },
    ],
  },
  {
    id: 'chat-capture-everything',
    originMode: 'chat',
    name: 'Capture to every mode',
    description:
      'A chat thread that has decisions worth capturing — save it as a task, an invoice draft, and a filed inbox item.',
    affectedModes: ['chat', 'work', 'money', 'inbox'],
    steps: [
      { sendToActionId: 'chat-to-work-task', label: 'Save as task' },
      { sendToActionId: 'chat-to-money-invoice', label: 'Save as invoice draft' },
      { sendToActionId: 'chat-to-inbox', label: 'File under inbox' },
    ],
  },
  {
    id: 'work-bill-and-discuss',
    originMode: 'work',
    name: 'Bill it and talk it through',
    description:
      'Promote a work task to an invoice line and pull up a chat to discuss the rationale before you send.',
    affectedModes: ['work', 'money', 'chat'],
    steps: [
      { sendToActionId: 'work-to-money-invoice', label: 'Bill this task' },
      { sendToActionId: 'work-to-chat', label: 'Discuss with BitBit' },
    ],
  },
]

// ─── Public API ───────────────────────────────────────────────────────────────

export function getRecipeById(id: string): ModeRecipe | undefined {
  return MODE_RECIPES.find(r => r.id === id)
}

/** Recipes whose origin matches the given mode — the menu the user sees there. */
export function getRecipesByOriginMode(mode: Mode): ModeRecipe[] {
  return MODE_RECIPES.filter(r => r.originMode === mode)
}

/** Recipes that touch the given mode at any step (origin or affected). */
export function getRecipesAffectingMode(mode: Mode): ModeRecipe[] {
  return MODE_RECIPES.filter(r => r.affectedModes.includes(mode))
}

/**
 * Validate that every step in a recipe references a real send-to action.
 * Tests use this to guard against action-id drift; consumers can use it to
 * defensive-check before rendering an "execute" CTA.
 */
export function isRecipeRegistered(recipe: ModeRecipe): boolean {
  return recipe.steps.every(s => findSendToAction(s.sendToActionId) !== undefined)
}

/**
 * Execute every step of a recipe in declaration order. Steps whose action
 * id isn't in the registry are recorded in `skippedSteps` rather than
 * throwing — recipe execution is best-effort.
 *
 * Each step fires its action's default handler (which dispatches the
 * `bb-send-to` event) unless the caller passes `overrides` keyed by action
 * id, mirroring the `executeSendToAction` override shape from #97.
 */
export async function executeRecipe<TPayload>(
  recipe: ModeRecipe,
  basePayload: TPayload,
  overrides?: Record<string, (ctx: SendToContext<TPayload>) => void | Promise<void>>,
): Promise<RecipeExecutionResult> {
  const executedSteps: string[] = []
  const skippedSteps: Array<{ sendToActionId: string; reason: string }> = []

  for (const step of recipe.steps) {
    const action = findSendToAction(step.sendToActionId)
    if (!action) {
      skippedSteps.push({
        sendToActionId: step.sendToActionId,
        reason: 'action not found in send-to registry',
      })
      continue
    }
    const payload = (step.payloadOverride ?? basePayload) as TPayload
    await executeSendToAction(action as unknown as SendToAction<TPayload>, payload, overrides)
    executedSteps.push(step.sendToActionId)
  }

  return { recipeId: recipe.id, executedSteps, skippedSteps }
}
