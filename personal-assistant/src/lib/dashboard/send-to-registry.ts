/**
 * send-to-registry.ts — Cross-mode "Send to" action registry.
 *
 * When a user is in mode A and wants to do something with an item over in
 * mode B (turn an inbox message into a work task; promote a chat thread to
 * an invoice draft; archive a task as a money line), they shouldn't have to
 * leave their current view. They right-click → "Send to → Work" and the
 * registry knows what action makes sense for that (sourceMode, targetMode)
 * pair.
 *
 * Mode is a *prior*, not a wall: this registry makes cross-mode flows
 * first-class without forcing users to manually switch modes for every
 * cross-domain action.
 *
 * Hide the machinery: handlers fire a `bb-send-to` custom event with the
 * canonical `{ action, sourceMode, targetMode, payload }` envelope. The
 * destination form/UI subscribes and decides what to do (open a task dialog
 * pre-filled with the message body, etc.). No imperative coupling between
 * source and destination components.
 */

import type { Mode } from './mode-store'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendToContext<TPayload = unknown> {
  sourceMode: Mode
  payload: TPayload
}

export interface SendToAction<TPayload = unknown> {
  /** Stable id, e.g. 'inbox-to-work-task'. Used in custom event + telemetry. */
  id: string
  /** Where the user is right-clicking from. */
  sourceMode: Mode
  /** Where the action targets. */
  targetMode: Mode
  /** Human-readable label shown in the menu. */
  label: string
  /** Optional secondary description. */
  description?: string
  /**
   * Predicate: does this action make sense for the given payload?
   * Use to gate by item type, presence of a contact, etc. Defaults to always true.
   */
  applies?: (ctx: SendToContext<TPayload>) => boolean
  /**
   * Default handler. The reusable component calls this when the menu item
   * is clicked. Implementers can override with `executeOverrides` per-mount
   * if a particular surface needs custom behavior.
   */
  handler: (ctx: SendToContext<TPayload>) => void | Promise<void>
}

export interface SendToEventDetail<TPayload = unknown> {
  actionId: string
  sourceMode: Mode
  targetMode: Mode
  payload: TPayload
}

export const SEND_TO_EVENT_NAME = 'bb-send-to' as const

// ─── Default handler ──────────────────────────────────────────────────────────

/**
 * The default handler dispatches a CustomEvent on `window`. UI components
 * that want to react to a send-to (e.g. open a task dialog pre-filled with
 * the message body) listen for `bb-send-to` and inspect `event.detail`.
 *
 * This decouples source (right-click in the inbox list) from destination
 * (task dialog deep in the work tree) — neither imports the other.
 */
function dispatchSendToEvent<TPayload>(action: SendToAction<TPayload>, ctx: SendToContext<TPayload>): void {
  if (typeof window === 'undefined') return
  const detail: SendToEventDetail<TPayload> = {
    actionId: action.id,
    sourceMode: action.sourceMode,
    targetMode: action.targetMode,
    payload: ctx.payload,
  }
  window.dispatchEvent(new CustomEvent(SEND_TO_EVENT_NAME, { detail }))
}

function defaultHandler<TPayload>(action: SendToAction<TPayload>) {
  return (ctx: SendToContext<TPayload>) => dispatchSendToEvent(action, ctx)
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * The canonical action set. Each entry's `handler` defaults to dispatching
 * `bb-send-to` so destination UIs can pick it up. Handlers can be replaced
 * for tests via `setRegistry`.
 *
 * We never offer source→source send (no chat→chat). The registry validates
 * this on insert.
 */
function buildAction<TPayload>(
  partial: Omit<SendToAction<TPayload>, 'handler'> & { handler?: SendToAction<TPayload>['handler'] },
): SendToAction<TPayload> {
  if (partial.sourceMode === partial.targetMode) {
    throw new Error(`send-to-registry: sourceMode and targetMode must differ (${partial.id})`)
  }
  const action: SendToAction<TPayload> = {
    id: partial.id,
    sourceMode: partial.sourceMode,
    targetMode: partial.targetMode,
    label: partial.label,
    description: partial.description,
    applies: partial.applies,
    handler: () => {},
  }
  action.handler = partial.handler ?? defaultHandler(action)
  return action
}

let REGISTRY: SendToAction[] = [
  // Inbox → other modes
  buildAction({
    id: 'inbox-to-work-task',
    sourceMode: 'inbox',
    targetMode: 'work',
    label: 'Create task from this',
    description: 'Open the task dialog pre-filled with the message subject and body.',
  }),
  buildAction({
    id: 'inbox-to-money-invoice',
    sourceMode: 'inbox',
    targetMode: 'money',
    label: 'Start invoice for sender',
    description: 'Begin a draft invoice scoped to the sender\'s contact.',
  }),
  buildAction({
    id: 'inbox-to-chat',
    sourceMode: 'inbox',
    targetMode: 'chat',
    label: 'Discuss with BitBit',
    description: 'Open chat with this thread pinned as context.',
  }),

  // Work → other modes
  buildAction({
    id: 'work-to-money-invoice',
    sourceMode: 'work',
    targetMode: 'money',
    label: 'Bill this task',
    description: 'Promote the task to an invoice line item.',
  }),
  buildAction({
    id: 'work-to-chat',
    sourceMode: 'work',
    targetMode: 'chat',
    label: 'Discuss with BitBit',
  }),

  // Money → other modes
  buildAction({
    id: 'money-to-work-task',
    sourceMode: 'money',
    targetMode: 'work',
    label: 'Create follow-up task',
    description: 'Track the chase as a task on the work board.',
  }),
  buildAction({
    id: 'money-to-chat',
    sourceMode: 'money',
    targetMode: 'chat',
    label: 'Discuss with BitBit',
  }),

  // Chat → other modes
  buildAction({
    id: 'chat-to-work-task',
    sourceMode: 'chat',
    targetMode: 'work',
    label: 'Save as task',
  }),
  buildAction({
    id: 'chat-to-money-invoice',
    sourceMode: 'chat',
    targetMode: 'money',
    label: 'Save as invoice draft',
  }),
  buildAction({
    id: 'chat-to-inbox',
    sourceMode: 'chat',
    targetMode: 'inbox',
    label: 'File under inbox',
  }),
]

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return all actions whose `sourceMode` matches and whose `applies` predicate
 * (if any) returns true for the given payload.
 */
export function getSendToActions<TPayload>(
  sourceMode: Mode,
  payload: TPayload,
): SendToAction<TPayload>[] {
  const ctx: SendToContext<TPayload> = { sourceMode, payload }
  return REGISTRY
    .filter(a => a.sourceMode === sourceMode)
    .filter(a => !a.applies || (a.applies as (c: SendToContext<TPayload>) => boolean)(ctx))
    .map(a => a as unknown as SendToAction<TPayload>)
}

/** Look up a single action by stable id. Returns undefined if missing. */
export function findSendToAction(id: string): SendToAction | undefined {
  return REGISTRY.find(a => a.id === id)
}

/**
 * Execute an action. Wrapper that allows callers to pass an `executeOverrides`
 * map keyed by action id — useful when a particular UI surface wants to intercept
 * the default event-dispatch handler with custom behavior (e.g. opening a local
 * dialog directly instead of going through the global event bus).
 */
export function executeSendToAction<TPayload>(
  action: SendToAction<TPayload>,
  payload: TPayload,
  overrides?: Record<string, (ctx: SendToContext<TPayload>) => void | Promise<void>>,
): void | Promise<void> {
  const ctx: SendToContext<TPayload> = { sourceMode: action.sourceMode, payload }
  const handler = overrides?.[action.id] ?? action.handler
  return handler(ctx)
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Test-only: replace the registry. Returns the previous registry for restoration. */
export function _setRegistryForTests(next: SendToAction[]): SendToAction[] {
  const prev = REGISTRY
  REGISTRY = next
  return prev
}

/** Test-only: re-export buildAction for fixtures. */
export { buildAction as _buildAction }
