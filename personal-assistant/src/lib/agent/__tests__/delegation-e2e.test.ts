/**
 * End-to-end integration test spanning the full delegation loop.
 *
 * Binds the NL layer (delegation-intent) to the mandate layer
 * (delegation-mandate) to the routing layer (autonomy-levels) to the
 * briefing layer (briefing-generator + aggregateDelegatedActionsByEntity).
 * Uses a stateful in-memory Supabase shim so each step observes the
 * results of the previous one.
 *
 * Narrative:
 *   1. User: "put Acme on autopilot"  → mandate set to infinite_autopilot
 *   2. Inbound invoice triggers send_email tool → shouldAutoExecute bypasses
 *      all gates because entity has infinite_autopilot mandate
 *   3. logDelegatedAction records the action with financial impact
 *   4. Morning briefing aggregates the action under the Acme entity section
 *   5. User: "take Acme back"         → mandate revoked
 *   6. Subsequent send_email tool falls through to L2 default (not executed)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  detectDelegationIntent,
  generateActivationConfirmation,
  generateRevocationConfirmation,
} from '../delegation-intent'
import {
  getEntityMandate,
  setEntityMandate,
  revokeEntityMandate,
  logDelegatedAction,
  aggregateDelegatedActionsByEntity,
  getDelegationAuditSummary,
} from '../delegation-mandate'
import { shouldAutoExecute } from '@/lib/intelligence/autonomy-levels'
import { generateMondayBriefing } from '../briefing-generator'

// ---------------------------------------------------------------------------
// Stateful Supabase shim
// ---------------------------------------------------------------------------

interface MandateRow {
  id: string
  org_id: string
  entity_id: string
  mandate_level: 'infinite_autopilot' | 'supervised' | 'standard'
  activated_at: string
  activated_via: string
  deactivated_at: string | null
  deactivated_via: string | null
}

interface ActionRow {
  id: string
  org_id: string
  entity_id: string
  mandate_id: string | null
  action_type: string
  action_summary: string
  action_payload: Record<string, unknown>
  financial_impact: Record<string, unknown> | null
  evidence_urls: string[]
  fiduciary_evaluation: Record<string, unknown> | null
  agent_run_id: string | null
  created_at: string
}

interface EntityRow {
  id: string
  org_id: string
  name: string
  is_active: boolean
  aliases: string[]
}

class Store {
  mandates: MandateRow[] = []
  actions: ActionRow[] = []
  entities: EntityRow[] = []
  idCounter = 0

  nextId(prefix = '') {
    return `${prefix}${++this.idCounter}`
  }
}

/**
 * Build a stateful Supabase mock that routes table queries to the in-memory
 * store. Supports the query shapes used by the delegation stack:
 *   - delegation_mandates: select + insert + update (for revoke/set)
 *   - delegation_action_log: select + insert (with entity_nodes join)
 *   - entity_nodes: select (name + aliases lookup)
 *   - briefing-generator tables (tasks/invoices/leads/etc.): empty responses
 */
function buildStatefulMock(store: Store): any {
  const empty = (chain: any) => {
    for (const m of ['select', 'insert', 'update', 'eq', 'is', 'gte', 'lte', 'lt', 'in', 'not', 'or', 'order', 'limit', 'contains', 'ilike']) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    chain.limit = vi.fn().mockResolvedValue({ data: [], error: null })
    chain.order = vi.fn().mockResolvedValue({ data: [], error: null })
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
    return chain
  }

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'delegation_mandates') {
        return buildMandatesChain(store)
      }
      if (table === 'delegation_action_log') {
        return buildActionsChain(store)
      }
      if (table === 'entity_nodes') {
        return buildEntitiesChain(store)
      }
      return empty({})
    }),
  }
}

function buildMandatesChain(store: Store): any {
  const filters: Array<(r: MandateRow) => boolean> = []
  let op: 'select' | 'update' = 'select'
  let updateValues: Partial<MandateRow> = {}

  const chain: any = {
    select: vi.fn().mockImplementation(() => chain),
    insert: vi.fn().mockImplementation((values: Omit<MandateRow, 'id' | 'activated_at' | 'deactivated_at' | 'deactivated_via'>) => {
      const row: MandateRow = {
        id: store.nextId('mandate-'),
        activated_at: new Date().toISOString(),
        deactivated_at: null,
        deactivated_via: null,
        ...values,
      } as MandateRow
      store.mandates.push(row)
      // return a chain that resolves via .select().single()
      const insertChain: any = {}
      insertChain.select = vi.fn().mockReturnValue(insertChain)
      insertChain.single = vi.fn().mockResolvedValue({ data: row, error: null })
      return insertChain
    }),
    update: vi.fn().mockImplementation((values: Partial<MandateRow>) => {
      op = 'update'
      updateValues = values
      return chain
    }),
    eq: vi.fn().mockImplementation((field: keyof MandateRow, value: string) => {
      filters.push((r) => r[field] === value)
      return chain
    }),
    is: vi.fn().mockImplementation((field: keyof MandateRow, value: null) => {
      filters.push((r) => r[field] === value)
      return chain
    }),
    order: vi.fn().mockImplementation(() => {
      const rows = store.mandates.filter((r) => filters.every((f) => f(r)))
      return Promise.resolve({ data: rows, error: null })
    }),
    maybeSingle: vi.fn().mockImplementation(() => {
      const rows = store.mandates.filter((r) => filters.every((f) => f(r)))
      return Promise.resolve({ data: rows[0] ?? null, error: null })
    }),
  }

  // Update resolves via .select() (not awaited on maybeSingle)
  const originalSelect = chain.select
  chain.select = vi.fn().mockImplementation((_cols?: string) => {
    if (op === 'update') {
      const rows = store.mandates.filter((r) => filters.every((f) => f(r)))
      const updated = rows.map((r) => {
        Object.assign(r, updateValues)
        return { id: r.id }
      })
      return Promise.resolve({ data: updated, error: null })
    }
    return originalSelect()
  })
  return chain
}

function buildActionsChain(store: Store): any {
  const filters: Array<(r: ActionRow) => boolean> = []
  const chain: any = {
    select: vi.fn().mockImplementation(() => chain),
    insert: vi.fn().mockImplementation((values: Omit<ActionRow, 'id' | 'created_at'>) => {
      const row: ActionRow = {
        id: store.nextId('action-'),
        created_at: new Date().toISOString(),
        ...values,
      } as ActionRow
      store.actions.push(row)
      const insertChain: any = {}
      insertChain.select = vi.fn().mockReturnValue(insertChain)
      insertChain.single = vi.fn().mockResolvedValue({ data: row, error: null })
      return insertChain
    }),
    eq: vi.fn().mockImplementation((field: keyof ActionRow, value: string) => {
      filters.push((r) => r[field] === value)
      return chain
    }),
    gte: vi.fn().mockImplementation((field: keyof ActionRow, value: string) => {
      filters.push((r) => (r[field] as string) >= value)
      return chain
    }),
    order: vi.fn().mockImplementation(() => {
      const rows = store.actions.filter((r) => filters.every((f) => f(r)))
      // Enrich with entity_nodes join expected by aggregator
      const enriched = rows.map((r) => ({
        ...r,
        entity_nodes: store.entities.find((e) => e.id === r.entity_id) ?? null,
      }))
      return Promise.resolve({ data: enriched, error: null })
    }),
  }
  return chain
}

function buildEntitiesChain(store: Store): any {
  const filters: Array<(r: EntityRow) => boolean> = []
  const chain: any = {
    select: vi.fn().mockImplementation(() => chain),
    eq: vi.fn().mockImplementation((field: keyof EntityRow, value: unknown) => {
      filters.push((r) => (r[field] as unknown) === value)
      return chain
    }),
    ilike: vi.fn().mockImplementation((field: keyof EntityRow, pattern: string) => {
      const lower = pattern.toLowerCase().replace(/%/g, '')
      filters.push((r) => String(r[field]).toLowerCase().includes(lower))
      return chain
    }),
    contains: vi.fn().mockImplementation((field: keyof EntityRow, values: string[]) => {
      filters.push((r) => {
        const arr = r[field] as string[]
        return values.every((v) => arr.includes(v))
      })
      return chain
    }),
    limit: vi.fn().mockImplementation(() => chain),
    maybeSingle: vi.fn().mockImplementation(() => {
      const rows = store.entities.filter((r) => filters.every((f) => f(r)))
      return Promise.resolve({ data: rows[0] ?? null, error: null })
    }),
  }
  return chain
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe('delegation end-to-end: activate → auto-execute → briefing → revoke', () => {
  let store: Store
  let supabase: any
  const ORG = 'org-1'
  const ACME_ID = 'entity-acme'

  beforeEach(() => {
    store = new Store()
    store.entities.push({
      id: ACME_ID,
      org_id: ORG,
      name: 'Acme',
      is_active: true,
      aliases: ['acme corp', 'acme corporation'],
    })
    supabase = buildStatefulMock(store)
    vi.clearAllMocks()
  })

  it('runs the full loop', async () => {
    // ── 1. User activates delegation via NL ────────────────────────────────
    const activateMsg = 'put Acme on autopilot'
    const activateIntent = detectDelegationIntent(activateMsg)
    expect(activateIntent).not.toBeNull()
    expect(activateIntent!.type).toBe('activate')
    expect(activateIntent!.entityMention.toLowerCase()).toContain('acme')
    expect(activateIntent!.confidence).toBeGreaterThan(0.6)

    const mandate = await setEntityMandate(
      supabase,
      ORG,
      ACME_ID,
      'infinite_autopilot',
      'whatsapp',
    )
    expect(mandate.mandate_level).toBe('infinite_autopilot')
    expect(mandate.deactivated_at).toBeNull()

    const activateConfirmation = generateActivationConfirmation('Acme')
    expect(activateConfirmation).toContain('Acme')
    expect(activateConfirmation).toContain('stop managing Acme')

    // ── 2. Active mandate retrievable ──────────────────────────────────────
    const fetched = await getEntityMandate(supabase, ORG, ACME_ID)
    expect(fetched?.id).toBe(mandate.id)
    expect(fetched?.mandate_level).toBe('infinite_autopilot')

    // ── 3. Downstream L2 tool bypasses approval under mandate ──────────────
    const delegationForRouter = {
      mandate: mandate.mandate_level,
      entityId: ACME_ID,
    }
    const bypassDecision = shouldAutoExecute(
      'send_email',        // normally L2 (propose)
      0.4,                 // low confidence — would normally NOT execute
      null,
      delegationForRouter,
    )
    expect(bypassDecision.execute).toBe(true)
    expect(bypassDecision.reason).toMatch(/infinite_autopilot/i)

    // ── 4. Action logged with financial impact ─────────────────────────────
    const logged = await logDelegatedAction(supabase, {
      org_id: ORG,
      entity_id: ACME_ID,
      mandate_id: mandate.id,
      action_type: 'send_email',
      action_summary: 'Sent overdue invoice reminder #1001 to Acme',
      financial_impact: { amount: 1500, currency: 'AUD', direction: 'inbound' },
      evidence_urls: ['https://mail.example.com/thread/abc'],
    })
    expect(logged.id).toBeTruthy()
    expect(store.actions).toHaveLength(1)

    // ── 5. Audit summary reflects the action ───────────────────────────────
    const summary = await getDelegationAuditSummary(supabase, ORG, ACME_ID)
    expect(summary.currentMandate?.id).toBe(mandate.id)
    expect(summary.totalActions).toBe(1)
    expect(summary.totalFinancialImpact).toBe(1500)
    expect(summary.totalMandates).toBe(1)

    // ── 6. Morning briefing aggregates the autonomous action ───────────────
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const aggregate = await aggregateDelegatedActionsByEntity(supabase, ORG, since)
    expect(aggregate).toHaveLength(1)
    expect(aggregate[0].entityId).toBe(ACME_ID)
    expect(aggregate[0].entityName).toBe('Acme')
    expect(aggregate[0].mandateLevel).toBe('infinite_autopilot')
    expect(aggregate[0].actionCount).toBe(1)
    expect(aggregate[0].totalFinancialImpact).toBe(1500)

    const briefing = await generateMondayBriefing(supabase, ORG)
    expect(briefing.sections[0].key).toBe('delegated_actions')
    expect(briefing.sections[0].items).toHaveLength(1)
    expect(briefing.sections[0].items[0].label).toContain('Acme')
    expect(briefing.summary.autonomousActions).toBe(1)
    expect(briefing.summary.autonomousImpact).toBe(1500)

    // ── 7. User revokes delegation via NL ──────────────────────────────────
    const revokeMsg = 'take Acme back'
    const revokeIntent = detectDelegationIntent(revokeMsg)
    expect(revokeIntent).not.toBeNull()
    expect(revokeIntent!.type).toBe('revoke')
    expect(revokeIntent!.entityMention.toLowerCase()).toContain('acme')

    const revoked = await revokeEntityMandate(supabase, ORG, ACME_ID, 'whatsapp')
    expect(revoked).toBe(true)

    const revokeConfirmation = generateRevocationConfirmation('Acme')
    expect(revokeConfirmation).toContain('Acme')
    expect(revokeConfirmation).toContain('driver')

    // ── 8. Post-revoke: no active mandate; routing reverts ─────────────────
    const postRevokeMandate = await getEntityMandate(supabase, ORG, ACME_ID)
    expect(postRevokeMandate).toBeNull()

    const postRevokeDecision = shouldAutoExecute(
      'send_email',
      0.4,
      null,
      null,           // no mandate
    )
    expect(postRevokeDecision.execute).toBe(false)
    expect(postRevokeDecision.reason).toMatch(/L2.*propose/i)

    // ── 9. Audit summary retains history ───────────────────────────────────
    const finalSummary = await getDelegationAuditSummary(supabase, ORG, ACME_ID)
    expect(finalSummary.currentMandate).toBeNull()
    expect(finalSummary.totalMandates).toBe(1) // historical
    expect(finalSummary.totalActions).toBe(1)
    expect(finalSummary.totalFinancialImpact).toBe(1500)
  })
})
