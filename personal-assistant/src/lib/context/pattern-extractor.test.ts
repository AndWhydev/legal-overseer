import { describe, it, expect, vi } from 'vitest'
import { extractPaymentPattern } from './pattern-extractor'

describe('extractPaymentPattern', () => {
  it('computes average payment days from created→paid event pairs', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { event_type: 'invoice_created', event_data: { invoice_id: 'inv-1' }, created_at: '2026-01-01T00:00:00Z' },
                    { event_type: 'invoice_paid', event_data: { invoice_id: 'inv-1' }, created_at: '2026-01-03T00:00:00Z' },
                    { event_type: 'invoice_created', event_data: { invoice_id: 'inv-2' }, created_at: '2026-02-01T00:00:00Z' },
                    { event_type: 'invoice_paid', event_data: { invoice_id: 'inv-2' }, created_at: '2026-02-04T00:00:00Z' },
                  ],
                  error: null
                })
              })
            })
          })
        })
      })
    } as any

    const result = await extractPaymentPattern(mockSupabase, 'org-1', 'contact-1')
    expect(result).not.toBeNull()
    expect(result!.patternType).toBe('payment_timing')
    expect(result!.data.avg_days).toBe(2.5) // (2 + 3) / 2
    expect(result!.sampleCount).toBe(2)
    expect(result!.confidence).toBeGreaterThan(0.5)
  })

  it('returns null with fewer than 2 event pairs', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          })
        })
      })
    } as any

    const result = await extractPaymentPattern(mockSupabase, 'org-1', 'contact-1')
    expect(result).toBeNull()
  })
})
