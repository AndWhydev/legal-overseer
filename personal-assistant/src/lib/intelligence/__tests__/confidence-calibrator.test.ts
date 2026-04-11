import { describe, expect, it } from 'vitest'
import {
  calculateBandStats,
  deriveThresholds,
  type ConfidenceBandStats,
} from '../confidence-calibrator'

// Helper: generate mock outcomes
function mockOutcomes(
  entries: Array<{ confidence: number; approved: boolean }>,
): Array<{ confidence_score: number; was_approved: boolean }> {
  return entries.map(e => ({
    confidence_score: e.confidence,
    was_approved: e.approved,
  }))
}

// Helper: fill a band with N outcomes at given approval rate
function fillBand(
  lower: number,
  upper: number,
  count: number,
  approvalRate: number,
): Array<{ confidence: number; approved: boolean }> {
  const mid = (lower + upper) / 2
  const approved = Math.round(count * approvalRate)
  const entries: Array<{ confidence: number; approved: boolean }> = []
  for (let i = 0; i < approved; i++) {
    entries.push({ confidence: mid, approved: true })
  }
  for (let i = 0; i < count - approved; i++) {
    entries.push({ confidence: mid, approved: false })
  }
  return entries
}

describe('confidence-calibrator', () => {
  describe('calculateBandStats', () => {
    it('correctly buckets outcomes into confidence bands', () => {
      const outcomes = mockOutcomes([
        { confidence: 0.55, approved: true },
        { confidence: 0.65, approved: true },
        { confidence: 0.65, approved: false },
        { confidence: 0.75, approved: true },
        { confidence: 0.85, approved: true },
        { confidence: 0.95, approved: true },
      ])

      const stats = calculateBandStats(outcomes)
      expect(stats).toHaveLength(5)

      // 0.50-0.60 band: 1 outcome, 100% approved
      const band50 = stats.find(s => s.band === '0.50-0.60')!
      expect(band50.total).toBe(1)
      expect(band50.approved).toBe(1)
      expect(band50.approvalRate).toBe(1.0)

      // 0.60-0.70 band: 2 outcomes, 50% approved
      const band60 = stats.find(s => s.band === '0.60-0.70')!
      expect(band60.total).toBe(2)
      expect(band60.approved).toBe(1)
      expect(band60.approvalRate).toBe(0.5)
    })

    it('handles empty outcomes', () => {
      const stats = calculateBandStats([])
      expect(stats).toHaveLength(5)
      stats.forEach(band => {
        expect(band.total).toBe(0)
        expect(band.approvalRate).toBe(0)
      })
    })

    it('includes confidence 1.0 in the last band', () => {
      const outcomes = mockOutcomes([
        { confidence: 1.0, approved: true },
      ])

      const stats = calculateBandStats(outcomes)
      const lastBand = stats.find(s => s.band === '0.90-1.00')!
      expect(lastBand.total).toBe(1)
      expect(lastBand.approved).toBe(1)
    })
  })

  describe('deriveThresholds', () => {
    it('correctly calculates thresholds from band stats with sufficient data', () => {
      // All bands have 25+ samples
      // 0.70-0.80: 96% approval -> meets act threshold (>= 95%)
      // 0.50-0.60: 75% approval -> meets ask threshold (>= 70%)
      const entries = [
        ...fillBand(0.50, 0.60, 25, 0.75),  // ask: 75% > 70%
        ...fillBand(0.60, 0.70, 25, 0.80),  // ask: 80% > 70%
        ...fillBand(0.70, 0.80, 25, 0.96),  // act: 96% > 95%
        ...fillBand(0.80, 0.90, 25, 0.98),  // act: 98% > 95%
        ...fillBand(0.90, 1.00, 25, 1.00),  // act: 100% > 95%
      ]

      const outcomes = mockOutcomes(entries)
      const stats = calculateBandStats(outcomes)
      const thresholds = deriveThresholds(stats)

      // Act threshold should be 0.70 (lowest band with >= 95% approval and >= 20 samples)
      expect(thresholds.act).toBe(0.70)
      // Ask threshold should be 0.50 (lowest band with >= 70% approval and >= 20 samples)
      expect(thresholds.ask).toBe(0.50)
    })

    it('enforces safety rail: act threshold cannot go below 0.70', () => {
      // Even if lower bands have high approval, act stays at 0.70
      const entries = [
        ...fillBand(0.50, 0.60, 25, 0.96),  // 96% approval in low band
        ...fillBand(0.60, 0.70, 25, 0.98),
        ...fillBand(0.70, 0.80, 25, 0.99),
        ...fillBand(0.80, 0.90, 25, 1.00),
        ...fillBand(0.90, 1.00, 25, 1.00),
      ]

      const outcomes = mockOutcomes(entries)
      const stats = calculateBandStats(outcomes)
      const thresholds = deriveThresholds(stats)

      expect(thresholds.act).toBeGreaterThanOrEqual(0.70)
    })

    it('enforces safety rail: ask threshold cannot go below 0.45', () => {
      // Even if very low bands have good approval rates
      const entries = [
        ...fillBand(0.50, 0.60, 25, 0.80),
        ...fillBand(0.60, 0.70, 25, 0.90),
        ...fillBand(0.70, 0.80, 25, 0.95),
        ...fillBand(0.80, 0.90, 25, 0.98),
        ...fillBand(0.90, 1.00, 25, 1.00),
      ]

      const outcomes = mockOutcomes(entries)
      const stats = calculateBandStats(outcomes)
      const thresholds = deriveThresholds(stats)

      expect(thresholds.ask).toBeGreaterThanOrEqual(0.45)
    })

    it('returns high thresholds when insufficient samples per band', () => {
      // Bands have < 20 samples (the minimum required)
      const entries = [
        ...fillBand(0.50, 0.60, 5, 1.00),
        ...fillBand(0.60, 0.70, 5, 1.00),
        ...fillBand(0.70, 0.80, 5, 1.00),
        ...fillBand(0.80, 0.90, 5, 1.00),
        ...fillBand(0.90, 1.00, 5, 1.00),
      ]

      const outcomes = mockOutcomes(entries)
      const stats = calculateBandStats(outcomes)
      const thresholds = deriveThresholds(stats)

      // With insufficient per-band samples, thresholds should be high (default 1.0 before safety rails)
      // act min is 0.70, but since no band qualifies, it should stay at 1.0
      expect(thresholds.act).toBe(1.0)
      expect(thresholds.ask).toBe(1.0)
    })

    it('handles all-approved scenario', () => {
      const entries = [
        ...fillBand(0.50, 0.60, 25, 1.00),
        ...fillBand(0.60, 0.70, 25, 1.00),
        ...fillBand(0.70, 0.80, 25, 1.00),
        ...fillBand(0.80, 0.90, 25, 1.00),
        ...fillBand(0.90, 1.00, 25, 1.00),
      ]

      const outcomes = mockOutcomes(entries)
      const stats = calculateBandStats(outcomes)
      const thresholds = deriveThresholds(stats)

      // With 100% approval everywhere, act should hit the safety floor of 0.70
      // (because 0.50 band has 100% approval >= 95%, but safety rail prevents act < 0.70)
      expect(thresholds.act).toBe(0.70)
      expect(thresholds.ask).toBe(0.50)
    })

    it('handles all-rejected scenario', () => {
      const entries = [
        ...fillBand(0.50, 0.60, 25, 0.00),
        ...fillBand(0.60, 0.70, 25, 0.00),
        ...fillBand(0.70, 0.80, 25, 0.00),
        ...fillBand(0.80, 0.90, 25, 0.00),
        ...fillBand(0.90, 1.00, 25, 0.00),
      ]

      const outcomes = mockOutcomes(entries)
      const stats = calculateBandStats(outcomes)
      const thresholds = deriveThresholds(stats)

      // With 0% approval everywhere, no band qualifies -> thresholds stay at 1.0
      expect(thresholds.act).toBe(1.0)
      expect(thresholds.ask).toBe(1.0)
    })

    it('ensures act > ask when they converge', () => {
      // Only the 0.70-0.80 band has sufficient approval for both act and ask
      const entries = [
        ...fillBand(0.50, 0.60, 25, 0.50),  // below both thresholds
        ...fillBand(0.60, 0.70, 25, 0.60),  // below both thresholds
        ...fillBand(0.70, 0.80, 25, 0.96),  // meets both act (95%) and ask (70%)
        ...fillBand(0.80, 0.90, 25, 0.98),
        ...fillBand(0.90, 1.00, 25, 1.00),
      ]

      const outcomes = mockOutcomes(entries)
      const stats = calculateBandStats(outcomes)
      const thresholds = deriveThresholds(stats)

      // Both would land at 0.70, so act should be bumped up
      expect(thresholds.act).toBeGreaterThan(thresholds.ask)
    })

    it('no data returns maximum thresholds', () => {
      const stats: ConfidenceBandStats[] = [
        { band: '0.50-0.60', lower: 0.50, upper: 0.60, total: 0, approved: 0, approvalRate: 0 },
        { band: '0.60-0.70', lower: 0.60, upper: 0.70, total: 0, approved: 0, approvalRate: 0 },
        { band: '0.70-0.80', lower: 0.70, upper: 0.80, total: 0, approved: 0, approvalRate: 0 },
        { band: '0.80-0.90', lower: 0.80, upper: 0.90, total: 0, approved: 0, approvalRate: 0 },
        { band: '0.90-1.00', lower: 0.90, upper: 1.00, total: 0, approved: 0, approvalRate: 0 },
      ]

      const thresholds = deriveThresholds(stats)
      expect(thresholds.act).toBe(1.0)
      expect(thresholds.ask).toBe(1.0)
    })
  })

  describe('integration: band stats -> threshold derivation', () => {
    it('gradually lowers thresholds as more approvals accumulate', () => {
      // Start with only 0.90-1.00 band having enough act-level approval
      // and 0.80-0.90 having ask-level approval
      const highOnly = mockOutcomes([
        ...fillBand(0.80, 0.90, 25, 0.80),  // ask: 80% > 70%, but not act
        ...fillBand(0.90, 1.00, 30, 0.97),  // act: 97% > 95%
      ])
      const highStats = calculateBandStats(highOnly)
      const highThresholds = deriveThresholds(highStats)

      // act = 0.90 (only 0.90-1.00 band qualifies for >95%)
      // ask = 0.80 (0.80-0.90 band qualifies for >70%)
      expect(highThresholds.act).toBe(0.90)
      expect(highThresholds.ask).toBe(0.80)

      // Now add medium-confidence approvals with high approval rates
      const withMedium = mockOutcomes([
        ...fillBand(0.60, 0.70, 25, 0.75),  // ask qualifies (75% > 70%)
        ...fillBand(0.70, 0.80, 25, 0.96),  // act qualifies (96% > 95%)
        ...fillBand(0.80, 0.90, 25, 0.98),
        ...fillBand(0.90, 1.00, 30, 0.97),
      ])
      const medStats = calculateBandStats(withMedium)
      const medThresholds = deriveThresholds(medStats)

      // Act should drop from 0.90 -> 0.70 as lower bands prove trustworthy
      expect(medThresholds.act).toBeLessThan(highThresholds.act)
      expect(medThresholds.act).toBe(0.70)
      // Ask should drop from 0.80 -> 0.60
      expect(medThresholds.ask).toBeLessThan(highThresholds.ask)
      expect(medThresholds.ask).toBe(0.60)
    })
  })
})
