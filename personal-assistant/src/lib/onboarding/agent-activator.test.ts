import { describe, it, expect } from 'vitest'
import { determineAgents } from './agent-activator'
import type { RevealWorldModel } from './stream-types'

describe('determineAgents', () => {
  const baseModel: RevealWorldModel = {
    user: { name: 'Tor', emails: ['tor@test.com'], businessName: 'Torkay', role: 'owner' },
    people: [],
    projects: [],
    financials: [],
  }

  it('activates Comms for any user with contacts', () => {
    const model: RevealWorldModel = {
      ...baseModel,
      people: [{ id: '1', name: 'Steve', company: '', role: '', relationship: 'client', messageCount: 10, frequency: 'weekly', lastInteraction: '', outstandingItems: [], emails: [] }],
    }
    const result = determineAgents(model)
    expect(result.activated).toContain('comms')
    expect(result.reasons.comms).toBeTruthy()
  })

  it('activates Finance when financials exist', () => {
    const model: RevealWorldModel = {
      ...baseModel,
      financials: [{ id: '1', type: 'receivable', entity: 'Steve', amount: '$700', currency: 'AUD', dueDate: '2026-04-15', status: 'pending' }],
    }
    const result = determineAgents(model)
    expect(result.activated).toContain('finance')
  })

  it('activates Sales when multiple clients exist', () => {
    const model: RevealWorldModel = {
      ...baseModel,
      people: [
        { id: '1', name: 'Steve', company: '', role: '', relationship: 'client', messageCount: 10, frequency: 'weekly', lastInteraction: '', outstandingItems: [], emails: [] },
        { id: '2', name: 'Maya', company: '', role: '', relationship: 'client', messageCount: 5, frequency: 'monthly', lastInteraction: '', outstandingItems: [], emails: [] },
      ],
    }
    const result = determineAgents(model)
    expect(result.activated).toContain('sales')
  })

  it('returns empty for empty world model', () => {
    const result = determineAgents(baseModel)
    expect(result.activated).toEqual([])
  })
})
