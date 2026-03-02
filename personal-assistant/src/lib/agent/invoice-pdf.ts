import type { InvoiceLineItem } from './shared-tools'

export interface InvoicePdfInput {
  invoice_number: string
  issued_date: string
  due_date: string
  client_name: string
  client_email?: string | null
  items: InvoiceLineItem[]
  subtotal: number
  tax: number
  total: number
  currency: string
  payment_terms_days?: number
  project_reference?: string | null
}

export interface InvoicePdfSettings {
  company_name?: string
  logo_url?: string
  primary_color?: string
  bank_details?: string
  payment_terms_days?: number
  abn?: string
  gst_registered?: boolean
  address_lines?: string[]
  payment_instructions?: string
}

export interface InvoicePdfResult {
  subject: string
  html: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function normalizeTerms(value: number | undefined): number {
  if (value === 7 || value === 14 || value === 30) return value
  return 14
}

function formatDate(dateLike: string): string {
  const parsed = new Date(dateLike)
  if (Number.isNaN(parsed.getTime())) return dateLike
  return parsed.toISOString().slice(0, 10)
}

export function generateInvoicePdf(
  invoice: InvoicePdfInput,
  orgSettings?: InvoicePdfSettings,
): InvoicePdfResult {
  const orgName = orgSettings?.company_name?.trim() || 'BitBit'
  const accent = orgSettings?.primary_color?.trim() || '#155dfc'
  const logo = orgSettings?.logo_url?.trim() || ''
  const termsDays = normalizeTerms(invoice.payment_terms_days ?? orgSettings?.payment_terms_days)
  const bankDetails = orgSettings?.payment_instructions?.trim() || orgSettings?.bank_details?.trim() || 'Bank details available on request'
  const abn = orgSettings?.abn?.trim() || ''
  const gstRegistered = orgSettings?.gst_registered !== false // default true
  const addressLines = orgSettings?.address_lines ?? []
  const subject = `Invoice ${invoice.invoice_number} from ${orgName}`

  const itemsMarkup = invoice.items
    .map((item) => {
      const qty = Number.isFinite(item.quantity) ? item.quantity : 1
      const unitPrice = Number.isFinite(item.unit_price) ? item.unit_price : item.total
      const total = Number.isFinite(item.total) ? item.total : qty * unitPrice
      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.description)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${qty}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(unitPrice, invoice.currency)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(total, invoice.currency)}</td>
        </tr>
      `
    })
    .join('')

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px;">
    <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <header style="padding:24px;border-bottom:1px solid #e2e8f0;background:#f8fafc;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-left:4px solid ${escapeHtml(accent)};">
        <div>
          ${gstRegistered ? '<p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#475569;font-weight:600;">Tax Invoice</p>' : ''}
          <h1 style="margin:0 0 6px;font-size:24px;color:${escapeHtml(accent)};">Invoice</h1>
          <p style="margin:0;font-size:14px;color:#334155;">${escapeHtml(orgName)}</p>
          ${addressLines.map(line => `<p style="margin:0;font-size:13px;color:#475569;">${escapeHtml(line)}</p>`).join('')}
          ${logo ? `<p style="margin:8px 0 0;font-size:12px;color:#64748b;">Logo: ${escapeHtml(logo)}</p>` : ''}
        </div>
        <div style="text-align:right;min-width:220px;">
          <p style="margin:0 0 6px;font-size:13px;"><strong>Invoice #:</strong> ${escapeHtml(invoice.invoice_number)}</p>
          <p style="margin:0 0 6px;font-size:13px;"><strong>Issued:</strong> ${escapeHtml(formatDate(invoice.issued_date))}</p>
          <p style="margin:0;font-size:13px;"><strong>Due:</strong> ${escapeHtml(formatDate(invoice.due_date))}</p>
        </div>
      </header>

      <section style="padding:20px 24px;display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;">
        <div>
          <h2 style="margin:0 0 8px;font-size:14px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">Bill To</h2>
          <p style="margin:0;font-size:14px;line-height:1.5;">
            ${escapeHtml(invoice.client_name)}<br/>
            ${invoice.client_email ? escapeHtml(invoice.client_email) : ''}
          </p>
        </div>
        <div style="min-width:240px;">
          <h2 style="margin:0 0 8px;font-size:14px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">Payment Terms</h2>
          <p style="margin:0 0 4px;font-size:14px;">${termsDays}-day terms</p>
          ${invoice.project_reference ? `<p style="margin:0;font-size:13px;color:#64748b;">Project: ${escapeHtml(invoice.project_reference)}</p>` : ''}
        </div>
      </section>

      <section style="padding:0 24px 24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#f1f5f9;color:#334155;">
              <th style="padding:10px 8px;text-align:left;">Description</th>
              <th style="padding:10px 8px;text-align:right;">Qty</th>
              <th style="padding:10px 8px;text-align:right;">Unit</th>
              <th style="padding:10px 8px;text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsMarkup}
          </tbody>
        </table>

        <div style="margin-top:20px;display:flex;justify-content:flex-end;">
          <table style="width:280px;border-collapse:collapse;font-size:14px;">
            <tr>
              <td style="padding:8px 0;color:#475569;">Subtotal</td>
              <td style="padding:8px 0;text-align:right;">${formatMoney(invoice.subtotal, invoice.currency)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#475569;">${gstRegistered ? 'GST (10%)' : 'Tax (0%)'}</td>
              <td style="padding:8px 0;text-align:right;">${formatMoney(gstRegistered ? invoice.tax : 0, invoice.currency)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;font-size:16px;font-weight:700;border-top:1px solid #cbd5e1;">Total</td>
              <td style="padding:10px 0;font-size:16px;font-weight:700;text-align:right;border-top:1px solid #cbd5e1;">${formatMoney(invoice.total, invoice.currency)}</td>
            </tr>
          </table>
        </div>
      </section>

      <footer style="padding:18px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;">
        <p style="margin:0 0 6px;font-size:13px;color:#334155;">Bank details: ${escapeHtml(bankDetails)}</p>
        ${abn ? `<p style="margin:0 0 6px;font-size:13px;color:#334155;">ABN: ${escapeHtml(abn)}</p>` : ''}
        ${gstRegistered ? '<p style="margin:0 0 6px;font-size:13px;color:#334155;">GST Registered</p>' : ''}
        <p style="margin:0;font-size:12px;color:#64748b;">Generated by Invoice Flow.</p>
      </footer>
    </div>
  </body>
</html>`

  return {
    subject,
    html,
  }
}
