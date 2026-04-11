import type { RevealWorldModel } from './stream-types'

export interface AgentActivationResult {
  activated: string[]
  reasons: Record<string, string>
}

export function determineAgents(model: RevealWorldModel): AgentActivationResult {
  const activated: string[] = []
  const reasons: Record<string, string> = {}

  // Comms: any contacts found
  if (model.people.length > 0) {
    activated.push('comms')
    reasons.comms = `${model.people.length} contacts to keep track of`
  }

  // Finance: any financial items
  if (model.financials.length > 0) {
    const totalItems = model.financials.length
    const receivables = model.financials.filter(f => f.type === 'receivable')
    activated.push('finance')
    reasons.finance = receivables.length > 0
      ? `${receivables.length} outstanding receivable${receivables.length > 1 ? 's' : ''} to track`
      : `${totalItems} financial item${totalItems > 1 ? 's' : ''} found`
  }

  // Sales: 2+ clients
  const clients = model.people.filter(p => p.relationship === 'client')
  if (clients.length >= 2) {
    activated.push('sales')
    reasons.sales = `${clients.length} active clients in the pipeline`
  }

  return { activated, reasons }
}
