/**
 * Bespoke connection flows — services that bypass the Composio OAuth router
 * and open a custom BitBit modal instead.
 *
 * Every id here MUST correspond to a mode handled by
 * `src/components/channels/connect-modal.tsx`.
 */

export const BESPOKE_FLOWS = new Set<string>(['whatsapp', 'stripe', 'imessage'])

export type BespokeFlowId = 'whatsapp' | 'stripe' | 'imessage'

export function isBespokeFlow(id: string): id is BespokeFlowId {
  return BESPOKE_FLOWS.has(id)
}
