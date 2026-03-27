import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock external dependencies that domain role modules import transitively.
// We only need the modules to load (so registerRole() fires); we don't need
// any real logic from these external libs.
// ---------------------------------------------------------------------------

// Logger (used by all 3 domain roles + sub-modules)
vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Finance transitive deps
vi.mock('@/lib/agent/invoice-flow', () => ({
  runInvoiceFlowTick: vi.fn(),
  type: {} as unknown,
}))
vi.mock('@/lib/agent/invoice-sender', () => ({
  checkOverdueInvoices: vi.fn(),
}))
vi.mock('@/lib/intelligence/cash-flow-prophet', () => ({
  projectCashFlow: vi.fn(),
}))

// Comms transitive deps
vi.mock('@/lib/agent/channel-triage', () => ({
  runTriage: vi.fn(),
}))
vi.mock('@/lib/agent/client-comms', () => ({
  runClientCommsTick: vi.fn(),
  draftReply: vi.fn(),
}))
vi.mock('@/lib/intelligence/client-health', () => ({
  computeClientHealth: vi.fn(),
}))

// Sales transitive deps
vi.mock('@/lib/agent/lead-swarm', () => ({
  runLeadSwarmTick: vi.fn(),
}))
vi.mock('@/lib/agent/proposal-bot', () => ({
  runWrappedProposalTick: vi.fn(),
  generateProposal: vi.fn(),
  listProposals: vi.fn(),
  getProposalById: vi.fn(),
}))
vi.mock('@/lib/agent/client-onboarding', () => ({
  runOnboardingCheck: vi.fn(),
  startClientOnboarding: vi.fn(),
  getOnboardingStatus: vi.fn(),
}))
vi.mock('@/lib/agent/approval-queue', () => ({
  createApproval: vi.fn(),
}))
vi.mock('@/lib/intelligence/revenue-radar', () => ({
  analyzeRevenueOpportunities: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports — domain role modules (side-effect: calls registerRole() at load)
// ---------------------------------------------------------------------------
import '@/lib/roles/finance/finance-role'
import '@/lib/roles/comms/comms-role'
import '@/lib/roles/sales/sales-role'

import { getRole, getRegisteredRoleTypes } from '@/lib/roles/role-registry'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Role Registration (side-effect imports)', () => {
  it('should register finance role via side-effect import', () => {
    const finance = getRole('finance')
    expect(finance).toBeDefined()
    expect(finance!.type).toBe('finance')
    expect(finance!.name).toBeTruthy()
    expect(finance!.evaluate).toBeTypeOf('function')
    expect(finance!.hasChanges).toBeTypeOf('function')
    expect(finance!.defaultConfig).toBeTypeOf('function')
  })

  it('should register comms role via side-effect import', () => {
    const comms = getRole('comms')
    expect(comms).toBeDefined()
    expect(comms!.type).toBe('comms')
    expect(comms!.name).toBeTruthy()
    expect(comms!.evaluate).toBeTypeOf('function')
    expect(comms!.hasChanges).toBeTypeOf('function')
    expect(comms!.defaultConfig).toBeTypeOf('function')
  })

  it('should register sales role via side-effect import', () => {
    const sales = getRole('sales')
    expect(sales).toBeDefined()
    expect(sales!.type).toBe('sales')
    expect(sales!.name).toBeTruthy()
    expect(sales!.evaluate).toBeTypeOf('function')
    expect(sales!.hasChanges).toBeTypeOf('function')
    expect(sales!.defaultConfig).toBeTypeOf('function')
  })

  it('should have all 3 domain role types registered', () => {
    const types = getRegisteredRoleTypes()
    expect(types).toContain('finance')
    expect(types).toContain('comms')
    expect(types).toContain('sales')
    expect(types.length).toBeGreaterThanOrEqual(3)
  })
})
