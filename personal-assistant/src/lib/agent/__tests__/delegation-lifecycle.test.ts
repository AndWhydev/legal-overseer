import { describe, it, expect, vi } from 'vitest'
import {
  setEntityMandate,
  revokeEntityMandate,
  logDelegatedAction,
  getEntityDelegationHistory,
  getActionsForMandate,
  getDelegationAuditSummary,
  type DelegationMandate,
  type DelegationActionEntry,
  type MandateLevel,
} from '../delegation-mandate'
import {
  routeAgentAction,
  type EntityDelegation,
  type ConfidenceRoutingResult,
} from '../confidence-router'

// ---------------------------------------------------------------------------
// Lifecycle integration test helpers
//
// These tests verify cross-module interactions. We mock Supabase at the
// transport layer while exercising real logic in delegation-mandate,
// confidence-router, and approval-queue modules.
// ---------------------------------------------------------------------------

function createMockChain(overrides: Record<string, unknown> = {}) {
  const defaults = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  }
  const fns = { ...defaults, ...overrides }

  for (const key of Object.keys(fns)) {
    if (!overrides[key]) {
      fns[key as keyof typeof fns] = vi.fn().mockReturnValue(fns)
    }
  }
  return fns
}

// ---------------------------------------------------------------------------
// Task 3: Delegation Lifecycle Integration Tests
// ---------------------------------------------------------------------------

describe('delegation lifecycle — full end-to-end', () => {
  it('activate → auto_delegated routing → action logged → revoke', async () => {
    const mandateData: DelegationMandate = {
      id: 'mandate-lifecycle-1',
      org_id: 'org-1',
      entity_id: 'entity-lc-1',
      mandate_level: 'infinite_autopilot',
      activated_at: '2026-04-10T00:00:00Z',
      activated_via: 'whatsapp',
      deactivated_at: null,
      deactivated_via: null,
    }

    // Step 1: Activate mandate (revoke chain + insert chain)
    const revokeChain = createMockChain({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const insertChain = createMockChain({
      single: vi.fn().mockResolvedValue({ data: mandateData, error: null }),
    })
    const activateSupabase = {
      from: vi.fn()
        .mockReturnValueOnce(revokeChain)
        .mockReturnValueOnce(insertChain),
    } as any

    const mandate = await setEntityMandate(
      activateSupabase, 'org-1', 'entity-lc-1', 'infinite_autopilot', 'whatsapp',
    )
    expect(mandate.mandate_level).toBe('infinite_autopilot')
    expect(mandate.id).toBe('mandate-lifecycle-1')

    // Step 2: Confidence router routes as auto_delegated
    const delegation: EntityDelegation = {
      mandate: mandate.mandate_level,
      entityId: mandate.entity_id,
    }
    const routing = routeAgentAction(
      0.3, // low confidence
      { confidence_thresholds: { act: 0.92, ask: 0.60 } }, // high-stakes agent config
      undefined,
      'invoice-flow',
      undefined,
      delegation,
    )
    expect(routing.decision).toBe('auto_delegated')
    expect(routing.reasoning).toContain('infinite_autopilot')

    // Step 3: Log the delegated action
    const actionData: DelegationActionEntry = {
      id: 'action-lc-1',
      org_id: 'org-1',
      entity_id: 'entity-lc-1',
      mandate_id: mandate.id,
      action_type: 'send_invoice',
      action_summary: 'Sent invoice #100 to SuperCorp',
      action_payload: { invoice_id: '100', recipient: 'supercorp' },
      financial_impact: { amount: 5000, currency: 'AUD', direction: 'outbound' },
      evidence_urls: ['https://app.bitbit.ai/invoices/100'],
      fiduciary_evaluation: { risk: 'low', score: 0.95, rationale: 'Recurring client' },
      agent_run_id: 'run-lc-1',
      created_at: '2026-04-10T09:00:00Z',
    }
    const logChain = createMockChain({
      single: vi.fn().mockResolvedValue({ data: actionData, error: null }),
    })
    const logSupabase = { from: vi.fn().mockReturnValue(logChain) } as any

    const action = await logDelegatedAction(logSupabase, {
      org_id: 'org-1',
      entity_id: 'entity-lc-1',
      mandate_id: mandate.id,
      action_type: 'send_invoice',
      action_summary: 'Sent invoice #100 to SuperCorp',
      action_payload: { invoice_id: '100', recipient: 'supercorp' },
      financial_impact: { amount: 5000, currency: 'AUD', direction: 'outbound' },
      evidence_urls: ['https://app.bitbit.ai/invoices/100'],
      fiduciary_evaluation: { risk: 'low', score: 0.95, rationale: 'Recurring client' },
      agent_run_id: 'run-lc-1',
    })
    expect(action.mandate_id).toBe(mandate.id)
    expect(action.evidence_urls).toHaveLength(1)

    // Step 4: Revoke the mandate
    const revokeResultChain = createMockChain({
      select: vi.fn().mockResolvedValue({
        data: [{ id: mandate.id }],
        error: null,
      }),
    })
    const revokeSupabase = { from: vi.fn().mockReturnValue(revokeResultChain) } as any

    const revoked = await revokeEntityMandate(revokeSupabase, 'org-1', 'entity-lc-1', 'dashboard')
    expect(revoked).toBe(true)

    // Step 5: After revoke, confidence router uses normal routing (not auto_delegated)
    const postRevokeDelegation: EntityDelegation = {
      mandate: 'standard',
      entityId: 'entity-lc-1',
    }
    const postRevokeRouting = routeAgentAction(
      0.3,
      { confidence_thresholds: { act: 0.92, ask: 0.60 } },
      undefined,
      'invoice-flow',
      undefined,
      postRevokeDelegation,
    )
    expect(postRevokeRouting.decision).not.toBe('auto_delegated')
    expect(postRevokeRouting.decision).toBe('escalate')
  })

  it('supervised mandate lowers routing thresholds correctly', () => {
    const supervisedDelegation: EntityDelegation = {
      mandate: 'supervised',
      entityId: 'entity-supervised-1',
    }

    // invoice-flow: act = 0.92, ask = 0.60
    // supervised reduces by 20%: act = 0.736, ask = 0.48

    // Confidence 0.75 — above supervised act threshold (0.736)
    const actResult = routeAgentAction(
      0.75,
      undefined,
      undefined,
      'invoice-flow',
      undefined,
      supervisedDelegation,
    )
    expect(actResult.decision).toBe('act')
    expect(actResult.thresholdSource).toBe('agent_type')

    // Confidence 0.50 — between supervised ask (0.48) and act (0.736)
    const askResult = routeAgentAction(
      0.50,
      undefined,
      undefined,
      'invoice-flow',
      undefined,
      supervisedDelegation,
    )
    expect(askResult.decision).toBe('ask')

    // Confidence 0.40 — below supervised ask threshold (0.48)
    const escalateResult = routeAgentAction(
      0.40,
      undefined,
      undefined,
      'invoice-flow',
      undefined,
      supervisedDelegation,
    )
    expect(escalateResult.decision).toBe('escalate')

    // Without supervised, 0.75 would be ask (below 0.92 act threshold)
    const normalDelegation: EntityDelegation = { mandate: 'standard', entityId: 'entity-normal' }
    const normalResult = routeAgentAction(
      0.75,
      undefined,
      undefined,
      'invoice-flow',
      undefined,
      normalDelegation,
    )
    expect(normalResult.decision).toBe('ask')
  })

  it('audit trail is complete after full lifecycle', async () => {
    // Simulate a full lifecycle and verify getDelegationAuditSummary
    // returns correct aggregation
    const mandates = [
      {
        id: 'mandate-audit-2',
        org_id: 'org-audit',
        entity_id: 'entity-audit-1',
        mandate_level: 'infinite_autopilot',
        activated_at: '2026-04-08T00:00:00Z',
        activated_via: 'dashboard',
        deactivated_at: null,
        deactivated_via: null,
      },
      {
        id: 'mandate-audit-1',
        org_id: 'org-audit',
        entity_id: 'entity-audit-1',
        mandate_level: 'supervised',
        activated_at: '2026-04-01T00:00:00Z',
        activated_via: 'api',
        deactivated_at: '2026-04-07T23:59:59Z',
        deactivated_via: 'dashboard',
      },
    ]
    const actions = [
      {
        id: 'a-audit-1',
        org_id: 'org-audit',
        entity_id: 'entity-audit-1',
        mandate_id: 'mandate-audit-2',
        action_type: 'send_invoice',
        action_summary: 'Invoice #200',
        action_payload: {},
        financial_impact: { amount: 3000, currency: 'AUD', direction: 'outbound' },
        evidence_urls: ['https://example.com/inv/200'],
        fiduciary_evaluation: { risk: 'low', score: 0.91 },
        agent_run_id: 'run-a1',
        created_at: '2026-04-10T10:00:00Z',
      },
      {
        id: 'a-audit-2',
        org_id: 'org-audit',
        entity_id: 'entity-audit-1',
        mandate_id: 'mandate-audit-2',
        action_type: 'reply',
        action_summary: 'Auto-reply to query',
        action_payload: {},
        financial_impact: null,
        evidence_urls: [],
        fiduciary_evaluation: null,
        agent_run_id: 'run-a2',
        created_at: '2026-04-10T09:00:00Z',
      },
      {
        id: 'a-audit-3',
        org_id: 'org-audit',
        entity_id: 'entity-audit-1',
        mandate_id: 'mandate-audit-1',
        action_type: 'approve_payment',
        action_summary: 'Approved $1200 to vendor',
        action_payload: {},
        financial_impact: { amount: 1200, currency: 'AUD', direction: 'outbound' },
        evidence_urls: [],
        fiduciary_evaluation: { risk: 'medium', score: 0.72 },
        agent_run_id: 'run-a3',
        created_at: '2026-04-05T14:00:00Z',
      },
    ]

    // Build mock that handles: getEntityMandate, getEntityDelegationHistory, actions query
    const mandateSelectChain = createMockChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: mandates[0], error: null }),
    })
    const mandateHistoryChain = createMockChain({
      order: vi.fn().mockResolvedValue({ data: mandates, error: null }),
    })
    const actionsChain = createMockChain({
      order: vi.fn().mockResolvedValue({ data: actions, error: null }),
    })

    const fromFn = vi.fn()
      .mockReturnValueOnce(mandateSelectChain)
      .mockReturnValueOnce(mandateHistoryChain)
      .mockReturnValueOnce(actionsChain)
    const supabase = { from: fromFn } as any

    const summary = await getDelegationAuditSummary(supabase, 'org-audit', 'entity-audit-1')

    expect(summary.currentMandate).not.toBeNull()
    expect(summary.currentMandate!.mandate_level).toBe('infinite_autopilot')
    expect(summary.totalMandates).toBe(2)
    expect(summary.totalActions).toBe(3)
    expect(summary.totalFinancialImpact).toBe(4200) // 3000 + 1200
    expect(summary.lastActionAt).toBe('2026-04-10T10:00:00Z')
  })

  it('imports from multiple modules verify integration points', async () => {
    // This test verifies that all the pieces from different modules
    // can work together without import errors or type mismatches.

    // 1. Types from delegation-mandate are compatible with confidence-router
    const mandate: DelegationMandate = {
      id: 'mandate-import-1',
      org_id: 'org-import',
      entity_id: 'entity-import-1',
      mandate_level: 'infinite_autopilot',
      activated_at: '2026-04-10T00:00:00Z',
      activated_via: 'dashboard',
      deactivated_at: null,
      deactivated_via: null,
    }

    // MandateLevel type from delegation-mandate maps to EntityDelegation.mandate
    const level: MandateLevel = mandate.mandate_level
    const delegation: EntityDelegation = {
      mandate: level,
      entityId: mandate.entity_id,
    }

    // 2. Confidence router accepts the delegation correctly
    const routing: ConfidenceRoutingResult = routeAgentAction(
      0.5, undefined, undefined, undefined, undefined, delegation,
    )
    expect(routing.decision).toBe('auto_delegated')

    // 3. Action entry type is compatible between logDelegatedAction and getActionsForMandate
    const actionEntry: DelegationActionEntry = {
      id: 'action-import-1',
      org_id: 'org-import',
      entity_id: 'entity-import-1',
      mandate_id: mandate.id,
      action_type: 'send_invoice',
      action_summary: 'Test',
      action_payload: {},
      financial_impact: { amount: 100, currency: 'AUD', direction: 'outbound' },
      evidence_urls: ['https://example.com'],
      fiduciary_evaluation: { risk: 'low', score: 0.9 },
      agent_run_id: null,
      created_at: '2026-04-10T00:00:00Z',
    }

    // Verify the types align across module boundaries
    expect(actionEntry.mandate_id).toBe(mandate.id)
    expect(delegation.mandate).toBe(mandate.mandate_level)

    // 4. Verify all exported functions are importable
    expect(typeof setEntityMandate).toBe('function')
    expect(typeof revokeEntityMandate).toBe('function')
    expect(typeof logDelegatedAction).toBe('function')
    expect(typeof getEntityDelegationHistory).toBe('function')
    expect(typeof getActionsForMandate).toBe('function')
    expect(typeof getDelegationAuditSummary).toBe('function')
    expect(typeof routeAgentAction).toBe('function')
  })
})
