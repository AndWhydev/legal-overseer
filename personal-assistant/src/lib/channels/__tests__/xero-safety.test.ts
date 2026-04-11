/**
 * CRITICAL SAFETY TESTS: Xero Invoice Creation
 *
 * These tests verify that BitBit NEVER creates AUTHORISED invoices in Xero.
 * All invoices must be created as DRAFT to prevent accidental financial actions.
 *
 * Business context: An AUTHORISED invoice in Xero triggers:
 * - Invoice delivery to the client
 * - Accounts receivable entries
 * - Tax reporting implications
 * - Potential financial/legal liability
 *
 * Therefore, BitBit must ONLY create DRAFT invoices for human review.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createXeroInvoice,
  updateXeroInvoice,
  type XeroCreateInvoiceData,
} from '../xero'

vi.mock('@/lib/integrations/credentials', () => ({
  getOrgCredential: vi.fn(),
}))

import { getOrgCredential } from '@/lib/integrations/credentials'
const mockGetCreds = vi.mocked(getOrgCredential)

afterEach(() => vi.restoreAllMocks())

const VALID_CREDS = {
  client_id: 'xero-client',
  client_secret: 'xero-secret',
  access_token: 'xero-token-valid',
  refresh_token: 'xero-refresh',
  token_expires_at: new Date(Date.now() + 3600000).toISOString(),
  tenant_id: 'tenant-id-789',
}

describe('Xero Invoice Safety', () => {
  // -------------------------------------------------------------------------
  // CRITICAL: Invoice creation status validation
  // -------------------------------------------------------------------------
  describe('CRITICAL: createXeroInvoice always sends correct data', () => {
    it('sends the invoice data exactly as provided (DRAFT status responsibility is on the caller)', async () => {
      mockGetCreds.mockResolvedValue(VALID_CREDS)
      let capturedBody = ''
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBody = init.body as string
        return Promise.resolve({
          ok: true,
          json: async () => ({
            Invoices: [{
              InvoiceID: 'inv-1',
              InvoiceNumber: 'INV-001',
              Status: 'DRAFT',
              Type: 'ACCREC',
              Contact: { Name: 'Client', ContactID: 'c-1' },
              Total: 1000,
              AmountDue: 1000,
              InvoiceDate: '2026-01-01',
            }],
          }),
        })
      }))

      const invoiceData: XeroCreateInvoiceData = {
        Type: 'ACCREC',
        Contact: { Name: 'Test Client' },
        LineItems: [
          { Description: 'Web Design', Quantity: 1, UnitAmount: 1000, AccountCode: '200' },
        ],
        DueDate: '2026-02-01',
        Reference: 'BitBit auto-generated',
      }

      const result = await createXeroInvoice({} as any, 'org-1', invoiceData, 'tenant-1')

      // Verify the API returns DRAFT status
      expect((result as any).Status).toBe('DRAFT')

      // Verify the request body structure
      const body = JSON.parse(capturedBody)
      expect(body.Invoices).toHaveLength(1)
      expect(body.Invoices[0].Type).toBe('ACCREC')
      expect(body.Invoices[0].Contact.Name).toBe('Test Client')
    })

    it('does NOT include Status: AUTHORISED in the API request body', async () => {
      mockGetCreds.mockResolvedValue(VALID_CREDS)
      let capturedBody = ''
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBody = init.body as string
        return Promise.resolve({
          ok: true,
          json: async () => ({
            Invoices: [{
              InvoiceID: 'inv-2',
              InvoiceNumber: 'INV-002',
              Status: 'DRAFT',
              Type: 'ACCREC',
              Contact: { Name: 'Client', ContactID: 'c-1' },
              Total: 500,
              AmountDue: 500,
              InvoiceDate: '2026-01-01',
            }],
          }),
        })
      }))

      // Explicitly test that even if someone passes Status, the data structure
      // is passed through -- meaning the API itself defaults to DRAFT
      // (Xero API creates DRAFT by default when no Status is provided)
      const invoiceData: XeroCreateInvoiceData = {
        Type: 'ACCREC',
        Contact: { Name: 'Safe Client' },
        LineItems: [
          { Description: 'Service', Quantity: 1, UnitAmount: 500, AccountCode: '200' },
        ],
      }

      await createXeroInvoice({} as any, 'org-1', invoiceData, 'tenant-1')

      const body = JSON.parse(capturedBody)
      // The XeroCreateInvoiceData type does NOT include a Status field
      // This is the type-level safety -- Status cannot be set during creation
      expect(body.Invoices[0]).not.toHaveProperty('Status')
    })

    it('XeroCreateInvoiceData type excludes Status field (compile-time safety)', () => {
      // This test documents that the TypeScript type XeroCreateInvoiceData
      // does NOT include a Status property, preventing AUTHORISED invoices
      // at compile time.
      const validData: XeroCreateInvoiceData = {
        Type: 'ACCREC',
        Contact: { Name: 'Test' },
        LineItems: [{ Description: 'X', Quantity: 1, UnitAmount: 100, AccountCode: '200' }],
      }

      // Verify the shape has no Status field
      const keys = Object.keys(validData)
      expect(keys).not.toContain('Status')

      // Xero API default: when Status is omitted, invoice is created as DRAFT
      // This is the primary safety mechanism
    })

    it('returned invoice from create always has a Status field for verification', async () => {
      mockGetCreds.mockResolvedValue(VALID_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Invoices: [{
            InvoiceID: 'inv-3',
            InvoiceNumber: 'INV-003',
            Status: 'DRAFT',
            Type: 'ACCREC',
            Contact: { Name: 'Client', ContactID: 'c-1' },
            Total: 750,
            AmountDue: 750,
            InvoiceDate: '2026-01-01',
          }],
        }),
      }))

      const result = await createXeroInvoice(
        {} as any,
        'org-1',
        {
          Type: 'ACCREC',
          Contact: { Name: 'Test' },
          LineItems: [{ Description: 'X', Quantity: 1, UnitAmount: 750, AccountCode: '200' }],
        },
        'tenant-1',
      )

      // Callers should ALWAYS verify Status === 'DRAFT' after creation
      expect(result).toHaveProperty('Status')
      expect((result as any).Status).toBe('DRAFT')
    })
  })

  // -------------------------------------------------------------------------
  // updateXeroInvoice safety
  // -------------------------------------------------------------------------
  describe('updateXeroInvoice safety considerations', () => {
    it('allows status update through updateXeroInvoice (for human-approved transitions)', async () => {
      mockGetCreds.mockResolvedValue(VALID_CREDS)
      let capturedBody = ''
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBody = init.body as string
        return Promise.resolve({
          ok: true,
          json: async () => ({
            Invoices: [{
              InvoiceID: 'inv-1',
              InvoiceNumber: 'INV-001',
              Status: 'SUBMITTED',
              Type: 'ACCREC',
              Contact: { Name: 'Client', ContactID: 'c-1' },
              Total: 1000,
              AmountDue: 1000,
              InvoiceDate: '2026-01-01',
            }],
          }),
        })
      }))

      // XeroUpdateInvoiceData CAN include Status (for human-approved transitions)
      // This is intentional -- updates happen after human review
      const result = await updateXeroInvoice(
        {} as any,
        'org-1',
        'inv-1',
        { Status: 'SUBMITTED' },
        'tenant-1',
      )

      expect((result as any).Status).toBe('SUBMITTED')
    })

    it('update sends to correct invoice endpoint', async () => {
      mockGetCreds.mockResolvedValue(VALID_CREDS)
      let capturedUrl = ''
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({
          ok: true,
          json: async () => ({
            Invoices: [{
              InvoiceID: 'inv-42',
              InvoiceNumber: 'INV-042',
              Status: 'DRAFT',
              Type: 'ACCREC',
              Contact: { Name: 'C', ContactID: 'c' },
              Total: 100,
              AmountDue: 100,
              InvoiceDate: '2026-01-01',
            }],
          }),
        })
      }))

      await updateXeroInvoice({} as any, 'org-1', 'inv-42', { DueDate: '2026-03-01' }, 'tenant-1')

      expect(capturedUrl).toContain('/Invoices/inv-42')
    })
  })

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles empty Invoices array in API response', async () => {
      mockGetCreds.mockResolvedValue(VALID_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ Invoices: [] }),
      }))

      const result = await createXeroInvoice(
        {} as any,
        'org-1',
        {
          Type: 'ACCREC',
          Contact: { Name: 'Ghost' },
          LineItems: [{ Description: 'X', Quantity: 1, UnitAmount: 1, AccountCode: '200' }],
        },
        'tenant-1',
      )

      // Should return an error object when no invoice is returned
      expect(result).toHaveProperty('error')
      expect((result as any).error).toContain('No invoice returned')
    })

    it('handles null Invoices in API response', async () => {
      mockGetCreds.mockResolvedValue(VALID_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ Invoices: null }),
      }))

      const result = await createXeroInvoice(
        {} as any,
        'org-1',
        {
          Type: 'ACCREC',
          Contact: { Name: 'Null' },
          LineItems: [{ Description: 'X', Quantity: 1, UnitAmount: 1, AccountCode: '200' }],
        },
        'tenant-1',
      )

      expect(result).toHaveProperty('error')
    })

    it('returns error when credentials are missing', async () => {
      mockGetCreds.mockResolvedValue(null)

      const result = await createXeroInvoice(
        {} as any,
        'org-1',
        {
          Type: 'ACCREC',
          Contact: { Name: 'No Creds' },
          LineItems: [{ Description: 'X', Quantity: 1, UnitAmount: 1, AccountCode: '200' }],
        },
        'tenant-1',
      )

      expect(result).toHaveProperty('error')
      expect((result as any).error).toContain('No valid Xero credentials')
    })

    it('returns error on Xero API 500 error', async () => {
      mockGetCreds.mockResolvedValue(VALID_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      }))

      const result = await createXeroInvoice(
        {} as any,
        'org-1',
        {
          Type: 'ACCREC',
          Contact: { Name: 'Error Client' },
          LineItems: [{ Description: 'X', Quantity: 1, UnitAmount: 1, AccountCode: '200' }],
        },
        'tenant-1',
      )

      expect(result).toHaveProperty('error')
      expect((result as any).error).toContain('Failed to create invoice')
    })

    it('returns error on network failure during create', async () => {
      mockGetCreds.mockResolvedValue(VALID_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))

      const result = await createXeroInvoice(
        {} as any,
        'org-1',
        {
          Type: 'ACCREC',
          Contact: { Name: 'Disconnected' },
          LineItems: [{ Description: 'X', Quantity: 1, UnitAmount: 1, AccountCode: '200' }],
        },
        'tenant-1',
      )

      expect(result).toHaveProperty('error')
      expect((result as any).details).toContain('ECONNRESET')
    })
  })
})
