import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  getXeroTenants,
  listXeroInvoices,
  createXeroInvoice,
  updateXeroInvoice,
  listXeroContacts,
  createXeroContact,
  listXeroPayments,
  createXeroPayment,
  listXeroBankTransactions,
  refreshXeroToken,
  xeroAdapter,
} from '../xero'

vi.mock('@/lib/integrations/credentials', () => ({
  getOrgCredential: vi.fn(),
}))

import { getOrgCredential } from '@/lib/integrations/credentials'
const mockGetCreds = vi.mocked(getOrgCredential)

afterEach(() => vi.restoreAllMocks())

const MOCK_CREDS = {
  client_id: 'xero-client-123',
  client_secret: 'xero-secret-456',
  access_token: 'xero-token-valid',
  refresh_token: 'xero-refresh-token',
  token_expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
  tenant_id: 'tenant-id-789',
}

const MOCK_EXPIRED_CREDS = {
  ...MOCK_CREDS,
  token_expires_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
}

describe('Xero Adapter', () => {
  describe('getXeroTenants', () => {
    it('returns error when no credentials', async () => {
      mockGetCreds.mockResolvedValue(null)
      const result = await getXeroTenants({} as any, 'org-1')
      expect(result).toHaveProperty('error')
      expect((result as any).error).toContain('No Xero credentials')
    })

    it('fetches tenants from Xero API', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: 'tenant-1', name: 'Business 1', shortCode: 'B1' },
          { id: 'tenant-2', name: 'Business 2', shortCode: 'B2' },
        ],
      }))

      const result = await getXeroTenants({} as any, 'org-1')
      expect(Array.isArray(result)).toBe(true)
      expect((result as any[])).toHaveLength(2)
      expect((result as any[])[0].name).toBe('Business 1')
    })

    it('handles fetch errors gracefully', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      }))

      const result = await getXeroTenants({} as any, 'org-1')
      expect(result).toHaveProperty('error')
      expect((result as any).details).toBe('Unauthorized')
    })
  })

  describe('listXeroInvoices', () => {
    it('returns error when no credentials', async () => {
      mockGetCreds.mockResolvedValue(null)
      const result = await listXeroInvoices({} as any, 'org-1')
      expect(result).toHaveProperty('error')
    })

    it('lists invoices with valid credentials', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Invoices: [
            {
              InvoiceID: 'inv-1',
              InvoiceNumber: 'INV-001',
              Status: 'DRAFT',
              Type: 'ACCREC',
              Contact: { Name: 'Client A', ContactID: 'contact-1' },
              Total: 1000,
              AmountDue: 1000,
              InvoiceDate: '2024-01-01',
            },
          ],
        }),
      }))

      const result = await listXeroInvoices({} as any, 'org-1', { tenantId: 'tenant-1' })
      expect(Array.isArray(result)).toBe(true)
      expect((result as any[])[0].InvoiceNumber).toBe('INV-001')
    })

    it('respects maxResults config', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      let capturedUrl = ''
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({
          ok: true,
          json: async () => ({ Invoices: [] }),
        })
      }))

      await listXeroInvoices({} as any, 'org-1', { tenantId: 'tenant-1', maxResults: 50 })
      expect(capturedUrl).toContain('pageSize=50')
    })
  })

  describe('createXeroInvoice', () => {
    it('creates invoice with valid data', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Invoices: [
            {
              InvoiceID: 'inv-new',
              InvoiceNumber: 'INV-002',
              Status: 'DRAFT',
              Type: 'ACCREC',
              Contact: { Name: 'New Client', ContactID: 'contact-new' },
              Total: 500,
              AmountDue: 500,
              InvoiceDate: '2024-01-15',
            },
          ],
        }),
      }))

      const result = await createXeroInvoice(
        {} as any,
        'org-1',
        {
          Type: 'ACCREC',
          Contact: { Name: 'New Client' },
          LineItems: [
            { Description: 'Service', Quantity: 1, UnitAmount: 500, AccountCode: '200' },
          ],
        },
        'tenant-1',
      )

      expect(result).toHaveProperty('InvoiceID')
      expect((result as any).InvoiceNumber).toBe('INV-002')
    })

    it('returns error on API failure', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      }))

      const result = await createXeroInvoice(
        {} as any,
        'org-1',
        {
          Type: 'ACCREC',
          Contact: { Name: 'Test' },
          LineItems: [],
        },
        'tenant-1',
      )

      expect(result).toHaveProperty('error')
    })
  })

  describe('updateXeroInvoice', () => {
    it('updates invoice successfully', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Invoices: [
            {
              InvoiceID: 'inv-1',
              InvoiceNumber: 'INV-001',
              Status: 'SUBMITTED',
              Type: 'ACCREC',
              Contact: { Name: 'Client A', ContactID: 'contact-1' },
              Total: 1000,
              AmountDue: 1000,
              InvoiceDate: '2024-01-01',
            },
          ],
        }),
      }))

      const result = await updateXeroInvoice(
        {} as any,
        'org-1',
        'inv-1',
        { Status: 'SUBMITTED' },
        'tenant-1',
      )

      expect((result as any).Status).toBe('SUBMITTED')
    })
  })

  describe('listXeroContacts', () => {
    it('lists contacts successfully', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Contacts: [
            {
              ContactID: 'contact-1',
              Name: 'Customer Inc',
              EmailAddress: 'contact@customer.com',
              ContactStatus: 'ACTIVE',
            },
          ],
        }),
      }))

      const result = await listXeroContacts({} as any, 'org-1', { tenantId: 'tenant-1' })
      expect(Array.isArray(result)).toBe(true)
      expect((result as any[])[0].Name).toBe('Customer Inc')
    })
  })

  describe('createXeroContact', () => {
    it('creates contact successfully', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Contacts: [
            {
              ContactID: 'contact-new',
              Name: 'New Customer',
              EmailAddress: 'new@example.com',
              ContactStatus: 'ACTIVE',
            },
          ],
        }),
      }))

      const result = await createXeroContact(
        {} as any,
        'org-1',
        {
          Name: 'New Customer',
          EmailAddress: 'new@example.com',
        },
        'tenant-1',
      )

      expect((result as any).ContactID).toBe('contact-new')
      expect((result as any).Name).toBe('New Customer')
    })
  })

  describe('listXeroPayments', () => {
    it('lists payments successfully', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Payments: [
            {
              PaymentID: 'payment-1',
              Invoice: { InvoiceID: 'inv-1', InvoiceNumber: 'INV-001' },
              Account: { Code: '200', Name: 'Bank' },
              Amount: 1000,
              PaymentDate: '2024-01-15',
              Status: 'AUTHORISED',
            },
          ],
        }),
      }))

      const result = await listXeroPayments({} as any, 'org-1', { tenantId: 'tenant-1' })
      expect(Array.isArray(result)).toBe(true)
      expect((result as any[])[0].Amount).toBe(1000)
    })
  })

  describe('createXeroPayment', () => {
    it('creates payment successfully', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          Payments: [
            {
              PaymentID: 'payment-new',
              Invoice: { InvoiceID: 'inv-1', InvoiceNumber: 'INV-001' },
              Account: { Code: '200', Name: 'Bank' },
              Amount: 500,
              PaymentDate: '2024-01-16',
              Status: 'AUTHORISED',
            },
          ],
        }),
      }))

      const result = await createXeroPayment(
        {} as any,
        'org-1',
        {
          Invoice: { InvoiceID: 'inv-1' },
          Account: { Code: '200' },
          Amount: 500,
          PaymentDate: '2024-01-16',
        },
        'tenant-1',
      )

      expect((result as any).PaymentID).toBe('payment-new')
      expect((result as any).Amount).toBe(500)
    })
  })

  describe('listXeroBankTransactions', () => {
    it('lists bank transactions successfully', async () => {
      mockGetCreds.mockResolvedValue(MOCK_CREDS)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          BankTransactions: [
            {
              BankTransactionID: 'bt-1',
              Type: 'ACCRECPAYMENT',
              Contact: { Name: 'Supplier A', ContactID: 'contact-1' },
              Total: 250,
              Status: 'AUTHORISED',
              Date: '2024-01-10',
            },
          ],
        }),
      }))

      const result = await listXeroBankTransactions({} as any, 'org-1', { tenantId: 'tenant-1' })
      expect(Array.isArray(result)).toBe(true)
      expect((result as any[])[0].Total).toBe(250)
    })
  })

  describe('refreshXeroToken', () => {
    it('returns existing token if not expired', async () => {
      const token = await refreshXeroToken({} as any, 'org-1', MOCK_CREDS)
      expect(token).toBe(MOCK_CREDS.access_token)
    })

    it('refreshes token if expired', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({}),
            }),
          }),
        }),
      }

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'xero-token-new',
          expires_in: 3600,
        }),
      }))

      const token = await refreshXeroToken(mockClient as any, 'org-1', MOCK_EXPIRED_CREDS)
      expect(token).toBe('xero-token-new')
    })

    it('returns null if refresh token missing', async () => {
      const credsNoRefresh = { ...MOCK_EXPIRED_CREDS, refresh_token: undefined }
      const token = await refreshXeroToken({} as any, 'org-1', credsNoRefresh as any)
      expect(token).toBeNull()
    })

    it('returns null on refresh failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }))

      const token = await refreshXeroToken({} as any, 'org-1', MOCK_EXPIRED_CREDS)
      expect(token).toBeNull()
    })
  })

  describe('xeroAdapter', () => {
    it('has correct metadata', () => {
      expect(xeroAdapter.type).toBe('xero')
      expect(xeroAdapter.name).toBe('Xero')
      expect(xeroAdapter.icon).toBe('BarChart3')
    })

    it('pull returns empty array', async () => {
      const result = await xeroAdapter.pull({}, new Date())
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })

    it('isAvailable checks environment variables', async () => {
      const originalClientId = process.env.XERO_CLIENT_ID
      const originalClientSecret = process.env.XERO_CLIENT_SECRET

      try {
        process.env.XERO_CLIENT_ID = 'test-client-id'
        process.env.XERO_CLIENT_SECRET = 'test-client-secret'

        const available = await xeroAdapter.isAvailable()
        expect(available).toBe(true)

        delete process.env.XERO_CLIENT_ID
        const unavailable = await xeroAdapter.isAvailable()
        expect(unavailable).toBe(false)
      } finally {
        process.env.XERO_CLIENT_ID = originalClientId
        process.env.XERO_CLIENT_SECRET = originalClientSecret
      }
    })
  })
})
