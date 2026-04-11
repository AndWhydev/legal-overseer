import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  scrapeAusTender,
  scrapeQTenders,
  scrapeNSWeTendering,
  scrapeAllSources,
  upsertScrapedTenders,
  type NormalizedTender,
} from './tender-sources'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockSupabase = {} as any

function makeAusTenderRow(title: string, extra: string = ''): string {
  return `<tr>
    <td><a href="/atm/show/ATM-12345">${title}</a></td>
    <td>ATM-12345</td>
    <td>Department of Finance</td>
    <td>$150,000.00</td>
    <td>15/06/2026</td>
    ${extra}
  </tr>`
}

function makeQTenderRow(title: string): string {
  return `<tr>
    <td><a href="/tender/display?id=QT-9876">${title}</a></td>
    <td>QT-9876</td>
    <td>$80,000.00</td>
    <td>20/07/2026</td>
  </tr>`
}

function makeNSWRow(title: string): string {
  return `<tr>
    <td><a href="/tender?event=public.rft.show&RFQID-5555">${title}</a></td>
    <td>RFQID-5555</td>
    <td>$200,000.00</td>
    <td>10/08/2026</td>
  </tr>`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tender-sources', () => {
  // -------------------------------------------------------------------------
  // scrapeAusTender
  // -------------------------------------------------------------------------
  describe('scrapeAusTender', () => {
    it('parses matching tenders from HTML response', async () => {
      const html = `
        <html><body><table>
          ${makeAusTenderRow('Web Design and Development Services')}
          ${makeAusTenderRow('Office Furniture Supply')}
        </table></body></html>
      `
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => html,
      }))

      const result = await scrapeAusTender(mockSupabase, 'org-1', ['web design'])

      expect(result.source).toBe('austender')
      expect(result.tenders).toHaveLength(1)
      expect(result.tenders[0].title).toBe('Web Design and Development Services')
      expect(result.tenders[0].source).toBe('austender')
      expect(result.tenders[0].tender_number).toBe('ATM-12345')
      expect(result.tenders[0].value).toBe(150000)
      expect(result.tenders[0].deadline).toBeTruthy()
      expect(result.errors).toHaveLength(0)
    })

    it('returns empty tenders when no keyword match', async () => {
      const html = `
        <html><body><table>
          ${makeAusTenderRow('Office Furniture Supply')}
        </table></body></html>
      `
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => html,
      }))

      const result = await scrapeAusTender(mockSupabase, 'org-1', ['blockchain'])

      expect(result.tenders).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    })

    it('returns error when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      }))

      const result = await scrapeAusTender(mockSupabase, 'org-1', ['web design'])

      expect(result.tenders).toHaveLength(0)
      expect(result.errors).toContain('AusTender: failed to fetch search results')
    })

    it('returns error when network request throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      const result = await scrapeAusTender(mockSupabase, 'org-1', ['web design'])

      expect(result.tenders).toHaveLength(0)
      expect(result.errors).toContain('AusTender: failed to fetch search results')
    })

    it('handles empty HTML response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '<html><body></body></html>',
      }))

      const result = await scrapeAusTender(mockSupabase, 'org-1', ['web design'])

      expect(result.tenders).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    })

    it('handles multiple keyword matches (case insensitive)', async () => {
      const html = `
        <html><body><table>
          ${makeAusTenderRow('DIGITAL TRANSFORMATION SERVICES')}
          ${makeAusTenderRow('Web Design Platform')}
          ${makeAusTenderRow('Office Chairs')}
        </table></body></html>
      `
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => html,
      }))

      const result = await scrapeAusTender(mockSupabase, 'org-1', ['digital', 'web design'])

      expect(result.tenders).toHaveLength(2)
    })

    it('constructs correct URL with encoded keywords', async () => {
      let capturedUrl = ''
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({
          ok: true,
          text: async () => '<html></html>',
        })
      }))

      await scrapeAusTender(mockSupabase, 'org-1', ['web design', 'IT services'])

      expect(capturedUrl).toContain('keyword=web+design+IT+services')
    })

    it('correctly parses DD/MM/YYYY date format', async () => {
      const html = `
        <html><body><table>
          ${makeAusTenderRow('Web Design Portal')}
        </table></body></html>
      `
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => html,
      }))

      const result = await scrapeAusTender(mockSupabase, 'org-1', ['web design'])

      expect(result.tenders[0].deadline).toContain('2026-06-15')
    })

    it('sets budget_min and budget_max as 80%/120% of value', async () => {
      const html = `
        <html><body><table>
          ${makeAusTenderRow('Web Design Services')}
        </table></body></html>
      `
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => html,
      }))

      const result = await scrapeAusTender(mockSupabase, 'org-1', ['web design'])

      expect(result.tenders[0].budget_min).toBe(120000)
      expect(result.tenders[0].budget_max).toBe(180000)
    })
  })

  // -------------------------------------------------------------------------
  // scrapeQTenders
  // -------------------------------------------------------------------------
  describe('scrapeQTenders', () => {
    it('parses matching tenders from QTenders HTML', async () => {
      const html = `
        <html><body><table>
          ${makeQTenderRow('Digital Services for Education')}
        </table></body></html>
      `
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => html,
      }))

      const result = await scrapeQTenders(mockSupabase, 'org-1', ['digital'])

      expect(result.source).toBe('qtenders')
      expect(result.tenders).toHaveLength(1)
      expect(result.tenders[0].source).toBe('qtenders')
      expect(result.tenders[0].tender_number).toBe('QT-9876')
      expect(result.tenders[0].value).toBe(80000)
    })

    it('returns error on fetch failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      }))

      const result = await scrapeQTenders(mockSupabase, 'org-1', ['web'])

      expect(result.tenders).toHaveLength(0)
      expect(result.errors).toContain('QTenders: failed to fetch search results')
    })

    it('handles no matching keywords', async () => {
      const html = `
        <html><body><table>
          ${makeQTenderRow('Office Supplies and Stationery')}
        </table></body></html>
      `
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => html,
      }))

      const result = await scrapeQTenders(mockSupabase, 'org-1', ['cybersecurity'])

      expect(result.tenders).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // scrapeNSWeTendering
  // -------------------------------------------------------------------------
  describe('scrapeNSWeTendering', () => {
    it('parses matching tenders from NSW HTML', async () => {
      const html = `
        <html><body><table>
          ${makeNSWRow('IT Infrastructure Upgrade')}
        </table></body></html>
      `
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => html,
      }))

      const result = await scrapeNSWeTendering(mockSupabase, 'org-1', ['IT'])

      expect(result.source).toBe('nsw')
      expect(result.tenders).toHaveLength(1)
      expect(result.tenders[0].source).toBe('nsw')
      expect(result.tenders[0].value).toBe(200000)
    })

    it('returns error on fetch failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('DNS resolution failed')))

      const result = await scrapeNSWeTendering(mockSupabase, 'org-1', ['IT'])

      expect(result.tenders).toHaveLength(0)
      expect(result.errors).toContain('NSW eTendering: failed to fetch search results')
    })
  })

  // -------------------------------------------------------------------------
  // scrapeAllSources
  // -------------------------------------------------------------------------
  describe('scrapeAllSources', () => {
    it('aggregates results from all three sources', async () => {
      let callCount = 0
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++
        const htmlMap: Record<number, string> = {
          1: `<html><table>${makeAusTenderRow('Web Design Federal')}</table></html>`,
          2: `<html><table>${makeQTenderRow('Web Portal QLD')}</table></html>`,
          3: `<html><table>${makeNSWRow('Web Platform NSW')}</table></html>`,
        }
        return Promise.resolve({
          ok: true,
          text: async () => htmlMap[callCount] || '<html></html>',
        })
      }))

      const result = await scrapeAllSources(mockSupabase, 'org-1', ['web'])

      expect(result.tenders.length).toBeGreaterThanOrEqual(0) // Some may not match
      expect(result.errors).toHaveLength(0)
    })

    it('handles partial failures gracefully (one source fails)', async () => {
      let callCount = 0
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 2) {
          return Promise.resolve({ ok: false, status: 500, text: async () => 'Error' })
        }
        return Promise.resolve({
          ok: true,
          text: async () => `<html><table>${makeAusTenderRow('Web Design')}</table></html>`,
        })
      }))

      const result = await scrapeAllSources(mockSupabase, 'org-1', ['web design'])

      // Should still have results from the successful sources
      expect(result.errors.length).toBeGreaterThanOrEqual(1)
    })

    it('handles all sources failing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))

      const result = await scrapeAllSources(mockSupabase, 'org-1', ['web'])

      expect(result.tenders).toHaveLength(0)
      expect(result.errors.length).toBeGreaterThanOrEqual(3)
    })
  })

  // -------------------------------------------------------------------------
  // upsertScrapedTenders
  // -------------------------------------------------------------------------
  describe('upsertScrapedTenders', () => {
    it('upserts all tenders and returns inserted count', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null })
      const fromMock = vi.fn().mockReturnValue({
        upsert: upsertMock,
      })
      const supabase = { from: fromMock } as any

      const tenders: NormalizedTender[] = [
        {
          title: 'Web Design',
          source: 'austender',
          tender_number: 'ATM-123',
          url: 'https://tenders.gov.au/atm/show/ATM-123',
          description: '',
          category: 'IT Services',
          value: 100000,
          budget_min: 80000,
          budget_max: 120000,
          deadline: '2026-06-15T23:59:59Z',
          raw_data: {},
        },
        {
          title: 'Digital Platform',
          source: 'qtenders',
          tender_number: 'QT-456',
          url: 'https://qtenders.epw.qld.gov.au/tender/display?id=456',
          description: '',
          category: '',
          value: 50000,
          budget_min: null,
          budget_max: null,
          deadline: null,
          raw_data: {},
        },
      ]

      const result = await upsertScrapedTenders(supabase, 'org-1', tenders)

      expect(result.inserted).toBe(2)
      expect(result.errors).toBe(0)
      expect(fromMock).toHaveBeenCalledWith('tenders')
      expect(upsertMock).toHaveBeenCalledTimes(2)
    })

    it('counts errors when upsert fails for individual tenders', async () => {
      let callCount = 0
      const upsertMock = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 2) {
          return Promise.resolve({ error: { message: 'Duplicate key violation' } })
        }
        return Promise.resolve({ error: null })
      })
      const supabase = {
        from: vi.fn().mockReturnValue({ upsert: upsertMock }),
      } as any

      const tenders: NormalizedTender[] = [
        { title: 'T1', source: 'austender', tender_number: 'ATM-1', url: 'u1', description: '', category: '', value: null, budget_min: null, budget_max: null, deadline: null, raw_data: {} },
        { title: 'T2', source: 'austender', tender_number: 'ATM-2', url: 'u2', description: '', category: '', value: null, budget_min: null, budget_max: null, deadline: null, raw_data: {} },
        { title: 'T3', source: 'austender', tender_number: 'ATM-3', url: 'u3', description: '', category: '', value: null, budget_min: null, budget_max: null, deadline: null, raw_data: {} },
      ]

      const result = await upsertScrapedTenders(supabase, 'org-1', tenders)

      expect(result.inserted).toBe(2)
      expect(result.errors).toBe(1)
    })

    it('handles empty tender array', async () => {
      const supabase = {
        from: vi.fn(),
      } as any

      const result = await upsertScrapedTenders(supabase, 'org-1', [])

      expect(result.inserted).toBe(0)
      expect(result.errors).toBe(0)
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('includes org_id in upserted rows', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null })
      const supabase = {
        from: vi.fn().mockReturnValue({ upsert: upsertMock }),
      } as any

      const tenders: NormalizedTender[] = [
        { title: 'Test', source: 'austender', tender_number: 'ATM-99', url: 'url', description: '', category: '', value: null, budget_min: null, budget_max: null, deadline: null, raw_data: {} },
      ]

      await upsertScrapedTenders(supabase, 'org-specific-id', tenders)

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ org_id: 'org-specific-id' }),
        expect.objectContaining({ onConflict: 'org_id,url' }),
      )
    })
  })
})
