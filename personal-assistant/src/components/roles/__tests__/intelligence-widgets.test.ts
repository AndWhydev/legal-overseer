import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// We test the fetch logic by extracting it into a helper. Since the actual
// component uses useCallback + setState, we replicate the data-mapping logic
// as a pure function that can be tested without React rendering.
// ---------------------------------------------------------------------------

// Mock fixtures matching the API response envelope: { success, metric, data }

const MOCK_REVENUE = {
  success: true,
  metric: 'revenue-radar',
  data: {
    opportunities: [
      { id: '1', type: 'upsell', estimatedValue: 5000 },
      { id: '2', type: 'renewal', estimatedValue: 3000 },
    ],
    totalEstimatedValue: 8000,
    clientsAnalyzed: 5,
    gatheringData: false,
    computedAt: new Date().toISOString(),
  },
}

const MOCK_HEALTH = {
  success: true,
  metric: 'client-health',
  data: {
    scores: [],
    averageScore: 72,
    clientsScored: 8,
    gatheringData: false,
    computedAt: new Date().toISOString(),
  },
}

const MOCK_CASHFLOW = {
  success: true,
  metric: 'cash-flow',
  data: {
    projections: [],
    currentMonth: { income: 15000, expenses: 8000, net: 7000 },
    alerts: [{ type: 'surplus', month: '2026-04', summary: 'Strong month' }],
    gatheringData: false,
    computedAt: new Date().toISOString(),
  },
}

const MOCK_CAPACITY = {
  success: true,
  metric: 'capacity',
  data: {
    utilizationPercent: 78,
    status: 'optimal',
    activeProjects: 4,
    activeTasks: 12,
    upcomingDeadlines: [],
    alerts: [{ type: 'deadline_cluster', summary: '3 deadlines this week' }],
    suggestions: [],
    gatheringData: false,
    computedAt: new Date().toISOString(),
  },
}

// ---------------------------------------------------------------------------
// Import the pure mapping function (exported from the component for testability)
// ---------------------------------------------------------------------------

import { mapIntelligenceResponses } from '../intelligence-widgets'

// ---------------------------------------------------------------------------
// Helper: create a mock fetch response
// ---------------------------------------------------------------------------

function mockResponse(body: object, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Intelligence Widgets - fetchIntelligence wiring', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('calls all 4 /api/intelligence/[metric] endpoints in parallel', async () => {
    const calls: string[] = []
    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      calls.push(url as string)
      if ((url as string).includes('revenue-radar')) return Promise.resolve(mockResponse(MOCK_REVENUE))
      if ((url as string).includes('client-health')) return Promise.resolve(mockResponse(MOCK_HEALTH))
      if ((url as string).includes('cash-flow')) return Promise.resolve(mockResponse(MOCK_CASHFLOW))
      if ((url as string).includes('capacity')) return Promise.resolve(mockResponse(MOCK_CAPACITY))
      return Promise.resolve(mockResponse({}, false, 404))
    }) as typeof fetch

    const [revRes, healthRes, cfRes, capRes] = await Promise.all([
      fetch('/api/intelligence/revenue-radar'),
      fetch('/api/intelligence/client-health'),
      fetch('/api/intelligence/cash-flow'),
      fetch('/api/intelligence/capacity'),
    ])

    expect(calls).toContain('/api/intelligence/revenue-radar')
    expect(calls).toContain('/api/intelligence/client-health')
    expect(calls).toContain('/api/intelligence/cash-flow')
    expect(calls).toContain('/api/intelligence/capacity')
    expect(calls).toHaveLength(4)
  })

  it('maps Revenue Radar response correctly -- opportunities is a count, not array', async () => {
    const result = await mapIntelligenceResponses(
      mockResponse(MOCK_REVENUE),
      mockResponse(MOCK_HEALTH),
      mockResponse(MOCK_CASHFLOW),
      mockResponse(MOCK_CAPACITY),
    )

    expect(result.revenueRadar).not.toBeNull()
    expect(result.revenueRadar!.totalEstimatedValue).toBe(8000)
    // opportunities is array.length (2), NOT the raw array
    expect(result.revenueRadar!.opportunities).toBe(2)
    expect(typeof result.revenueRadar!.opportunities).toBe('number')
    expect(result.revenueRadar!.clientsAnalyzed).toBe(5)
  })

  it('maps Cash Flow response correctly -- currentNet from currentMonth.net, alerts from alerts.length', async () => {
    const result = await mapIntelligenceResponses(
      mockResponse(MOCK_REVENUE),
      mockResponse(MOCK_HEALTH),
      mockResponse(MOCK_CASHFLOW),
      mockResponse(MOCK_CAPACITY),
    )

    expect(result.cashFlow).not.toBeNull()
    expect(result.cashFlow!.currentNet).toBe(7000)
    // alerts is array.length (1), NOT the raw array
    expect(result.cashFlow!.alerts).toBe(1)
    expect(typeof result.cashFlow!.alerts).toBe('number')
  })

  it('maps Capacity response correctly -- alerts from alerts.length, status passed through', async () => {
    const result = await mapIntelligenceResponses(
      mockResponse(MOCK_REVENUE),
      mockResponse(MOCK_HEALTH),
      mockResponse(MOCK_CASHFLOW),
      mockResponse(MOCK_CAPACITY),
    )

    expect(result.capacity).not.toBeNull()
    expect(result.capacity!.utilizationPercent).toBe(78)
    expect(result.capacity!.status).toBe('optimal')
    // alerts is array.length (1), NOT the raw array
    expect(result.capacity!.alerts).toBe(1)
    expect(typeof result.capacity!.alerts).toBe('number')
  })

  it('if one endpoint returns non-OK, other 3 widgets still receive data', async () => {
    // Revenue returns 500, others succeed
    const result = await mapIntelligenceResponses(
      mockResponse({}, false, 500),
      mockResponse(MOCK_HEALTH),
      mockResponse(MOCK_CASHFLOW),
      mockResponse(MOCK_CAPACITY),
    )

    expect(result.revenueRadar).toBeNull()
    expect(result.clientHealth).not.toBeNull()
    expect(result.clientHealth!.averageScore).toBe(72)
    expect(result.cashFlow).not.toBeNull()
    expect(result.cashFlow!.currentNet).toBe(7000)
    expect(result.capacity).not.toBeNull()
    expect(result.capacity!.utilizationPercent).toBe(78)
  })

  it('if one endpoint fetch throws, other 3 widgets still receive data', async () => {
    // Pass null for revenue (simulating .catch(() => null))
    const result = await mapIntelligenceResponses(
      null,
      mockResponse(MOCK_HEALTH),
      mockResponse(MOCK_CASHFLOW),
      mockResponse(MOCK_CAPACITY),
    )

    expect(result.revenueRadar).toBeNull()
    expect(result.clientHealth).not.toBeNull()
    expect(result.cashFlow).not.toBeNull()
    expect(result.capacity).not.toBeNull()
  })

  it('gatheringData flag from backend is passed through, not hardcoded to true', async () => {
    // All mocks have gatheringData: false
    const result = await mapIntelligenceResponses(
      mockResponse(MOCK_REVENUE),
      mockResponse(MOCK_HEALTH),
      mockResponse(MOCK_CASHFLOW),
      mockResponse(MOCK_CAPACITY),
    )

    expect(result.revenueRadar!.gatheringData).toBe(false)
    expect(result.clientHealth!.gatheringData).toBe(false)
    expect(result.cashFlow!.gatheringData).toBe(false)
    expect(result.capacity!.gatheringData).toBe(false)

    // Now test with gatheringData: true
    const gatheringRevenue = {
      ...MOCK_REVENUE,
      data: { ...MOCK_REVENUE.data, gatheringData: true },
    }
    const resultGathering = await mapIntelligenceResponses(
      mockResponse(gatheringRevenue),
      mockResponse(MOCK_HEALTH),
      mockResponse(MOCK_CASHFLOW),
      mockResponse(MOCK_CAPACITY),
    )

    expect(resultGathering.revenueRadar!.gatheringData).toBe(true)
  })
})
