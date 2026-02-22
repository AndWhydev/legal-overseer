import { describe, expect, it } from 'vitest'
import { generateInvoicePdf } from './invoice-pdf'

describe('generateInvoicePdf', () => {
  it('renders required invoice fields in HTML output', () => {
    const result = generateInvoicePdf(
      {
        invoice_number: 'AWU-202602-001',
        issued_date: '2026-02-22',
        due_date: '2026-03-08',
        client_name: 'White House RE',
        client_email: 'accounts@example.com',
        items: [{ description: 'Website updates', quantity: 1, unit_price: 500, total: 500 }],
        subtotal: 500,
        tax: 50,
        total: 550,
        currency: 'AUD',
        payment_terms_days: 14,
        project_reference: 'Website updates',
      },
      {
        company_name: 'All Webbed Up',
        bank_details: 'BSB 111-222 / ACC 12345678',
      },
    )

    expect(result.subject).toContain('AWU-202602-001')
    expect(result.subject).toContain('All Webbed Up')
    expect(result.html).toContain('Invoice #:')
    expect(result.html).toContain('White House RE')
    expect(result.html).toContain('Website updates')
    expect(result.html).toContain('GST (10%)')
    expect(result.html).toContain('14-day terms')
    expect(result.html).toContain('BSB 111-222 / ACC 12345678')
  })

  it('falls back to default terms when unsupported value is provided', () => {
    const result = generateInvoicePdf({
      invoice_number: 'INV-1',
      issued_date: '2026-02-22',
      due_date: '2026-03-01',
      client_name: 'Client',
      items: [{ description: 'Support', quantity: 1, unit_price: 100, total: 100 }],
      subtotal: 100,
      tax: 10,
      total: 110,
      currency: 'AUD',
      payment_terms_days: 10,
    })

    expect(result.html).toContain('14-day terms')
  })
})
