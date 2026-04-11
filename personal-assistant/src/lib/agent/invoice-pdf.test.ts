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

  it('renders ABN in footer when provided in settings', () => {
    const result = generateInvoicePdf(
      {
        invoice_number: 'INV-ABN',
        issued_date: '2026-02-22',
        due_date: '2026-03-08',
        client_name: 'Test Client',
        items: [{ description: 'Work', quantity: 1, unit_price: 100, total: 100 }],
        subtotal: 100,
        tax: 10,
        total: 110,
        currency: 'AUD',
      },
      {
        company_name: 'All Webbed Up',
        abn: '51 824 753 556',
        gst_registered: true,
      },
    )

    expect(result.html).toContain('ABN: 51 824 753 556')
    expect(result.html).toContain('GST Registered')
    expect(result.html).toContain('Tax Invoice')
  })

  it('shows Tax Invoice label when gst_registered is undefined (defaults to true)', () => {
    const result = generateInvoicePdf(
      {
        invoice_number: 'INV-DEF',
        issued_date: '2026-02-22',
        due_date: '2026-03-08',
        client_name: 'Test Client',
        items: [{ description: 'Work', quantity: 1, unit_price: 100, total: 100 }],
        subtotal: 100,
        tax: 10,
        total: 110,
        currency: 'AUD',
      },
      { company_name: 'Default Co' },
    )

    expect(result.html).toContain('Tax Invoice')
    expect(result.html).toContain('GST (10%)')
  })

  it('shows Tax (0%) and hides Tax Invoice label when gst_registered is false', () => {
    const result = generateInvoicePdf(
      {
        invoice_number: 'INV-NOGST',
        issued_date: '2026-02-22',
        due_date: '2026-03-08',
        client_name: 'Test Client',
        items: [{ description: 'Work', quantity: 1, unit_price: 100, total: 100 }],
        subtotal: 100,
        tax: 10,
        total: 110,
        currency: 'AUD',
      },
      { company_name: 'No GST Co', gst_registered: false },
    )

    expect(result.html).not.toContain('Tax Invoice')
    expect(result.html).toContain('Tax (0%)')
    expect(result.html).not.toContain('GST (10%)')
    expect(result.html).not.toContain('GST Registered')
    // Should show $0.00 for tax, not the actual tax value
    expect(result.html).toContain('$0.00')
  })

  it('renders address lines in header when provided', () => {
    const result = generateInvoicePdf(
      {
        invoice_number: 'INV-ADDR',
        issued_date: '2026-02-22',
        due_date: '2026-03-08',
        client_name: 'Test Client',
        items: [{ description: 'Work', quantity: 1, unit_price: 100, total: 100 }],
        subtotal: 100,
        tax: 10,
        total: 110,
        currency: 'AUD',
      },
      {
        company_name: 'Addr Co',
        address_lines: ['123 Main St', 'Sydney NSW 2000'],
      },
    )

    expect(result.html).toContain('123 Main St')
    expect(result.html).toContain('Sydney NSW 2000')
  })

  it('uses payment_instructions when provided instead of bank_details', () => {
    const result = generateInvoicePdf(
      {
        invoice_number: 'INV-PAY',
        issued_date: '2026-02-22',
        due_date: '2026-03-08',
        client_name: 'Test Client',
        items: [{ description: 'Work', quantity: 1, unit_price: 100, total: 100 }],
        subtotal: 100,
        tax: 10,
        total: 110,
        currency: 'AUD',
      },
      {
        company_name: 'Pay Co',
        bank_details: 'BSB 111-222 / ACC 12345678',
        payment_instructions: 'Pay via PayPal to pay@example.com',
      },
    )

    expect(result.html).toContain('Pay via PayPal to pay@example.com')
    expect(result.html).not.toContain('BSB 111-222')
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
