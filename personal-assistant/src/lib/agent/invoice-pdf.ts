import type { InvoiceLineItem } from './shared-tools'

export interface InvoicePdfInput {
  invoice_number: string
  issued_date: string
  due_date: string
  client_name: string
  client_email?: string | null
  client_phone?: string | null
  client_company?: string | null
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
  logo_base64?: string
  primary_color?: string
  accent_color?: string
  bank_details?: string
  payment_terms_days?: number
  abn?: string
  gst_registered?: boolean
  address_lines?: string[]
  payment_instructions?: string
  footer_text?: string
  terms?: string
}

export interface InvoicePdfResult {
  subject: string
  html: string
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function fmtDate(dateLike: string): string {
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return dateLike
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtDateShort(dateLike: string): string {
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return dateLike
  return d.toISOString().slice(0, 10)
}

export function generateInvoicePdf(
  invoice: InvoicePdfInput,
  orgSettings?: InvoicePdfSettings,
): InvoicePdfResult {
  const orgName = orgSettings?.company_name?.trim() || 'BitBit'
  const primary = orgSettings?.primary_color?.trim() || '#1a2744'
  const accent = orgSettings?.accent_color?.trim() || '#2d6bc4'
  const termsDays = invoice.payment_terms_days ?? orgSettings?.payment_terms_days ?? 7
  const abn = orgSettings?.abn?.trim() || ''
  const gstRegistered = orgSettings?.gst_registered === true
  const addressLines = orgSettings?.address_lines ?? []
  const footerText = orgSettings?.footer_text?.trim() || ''
  const termsText = orgSettings?.terms?.trim() || ''
  const subject = `Invoice ${invoice.invoice_number} from ${orgName}`

  // Payment info - structured fields
  const paymentInstructions = orgSettings?.payment_instructions?.trim() || ''
  const bankDetails = orgSettings?.bank_details?.trim() || ''

  // Parse payment instructions into key-value pairs for the grid
  const paymentPairs: Array<{ label: string; value: string }> = []
  if (paymentInstructions) {
    paymentInstructions.split('|').forEach(part => {
      const [label, ...rest] = part.split(':')
      if (label && rest.length) {
        paymentPairs.push({ label: label.trim(), value: rest.join(':').trim() })
      }
    })
  }
  // Fallback to bank_details as a single line
  const hasParsedPayment = paymentPairs.length > 0

  const itemsMarkup = invoice.items
    .map((item) => {
      const qty = Number.isFinite(item.quantity) ? item.quantity : 1
      const unitPrice = Number.isFinite(item.unit_price) ? item.unit_price : item.total
      const total = Number.isFinite(item.total) ? item.total : qty * unitPrice
      return `
            <tr>
              <td style="padding:14px 14px;border-bottom:1px solid #f1f5f9;color:#334155;line-height:1.5;">${esc(item.description)}</td>
              <td style="padding:14px 14px;border-bottom:1px solid #f1f5f9;text-align:right;color:#334155;font-weight:600;">${money(total, invoice.currency)}</td>
            </tr>`
    })
    .join('')

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(subject)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .page {
      width: 794px; min-height: 1123px; margin: 0 auto;
      background: #ffffff; border-radius: 2px;
      display: flex; flex-direction: column;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    @media print {
      body { padding: 0; background: #fff; }
      .page { box-shadow: none; min-height: auto; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div style="padding:44px 48px 32px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
      <div>
        <h1 style="margin:0 0 6px;font-size:36px;font-weight:700;letter-spacing:-0.03em;color:${esc(primary)};">INVOICE</h1>
        <p style="margin:0;font-size:13px;color:#64748b;">${esc(orgName)}${addressLines.length ? ' - ' + addressLines.map(l => esc(l)).join(', ') : ''}</p>
      </div>
      <div style="text-align:right;">
        <p style="margin:0 0 2px;font-size:18px;font-weight:700;color:${esc(primary)};">Invoice #${esc(invoice.invoice_number)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#64748b;line-height:1.8;">
          <strong style="color:#334155;">Date:</strong> ${esc(fmtDate(invoice.issued_date))}<br/>
          <strong style="color:#334155;">Due Date:</strong> ${esc(fmtDate(invoice.due_date))}
        </p>
      </div>
    </div>

    <div style="height:3px;background:linear-gradient(90deg,${esc(primary)},${esc(accent)});margin:0 48px;border-radius:2px;"></div>

    <!-- Due banner -->
    <div style="margin:28px 48px 0;padding:14px 20px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;font-size:14px;color:#92400e;text-align:center;">
      <strong style="color:#b45309;">Payment Due: ${esc(fmtDate(invoice.due_date))}</strong> (${termsDays} days from invoice date)
    </div>

    <!-- From / Bill To -->
    <div style="padding:28px 48px;display:flex;gap:80px;">
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:12px;">FROM</div>
        <p style="margin:0;font-size:15px;font-weight:700;color:#1e293b;">${esc(orgName)}</p>
        ${addressLines.map(l => `<p style="margin:4px 0 0;font-size:13px;color:#475569;">${esc(l)}</p>`).join('')}
        <p style="margin:4px 0 0;font-size:13px;color:#475569;">Email: contact@torkay.com</p>
        ${abn ? `<p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">ABN: ${esc(abn)}</p>` : ''}
      </div>
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:12px;">BILL TO</div>
        <p style="margin:0;font-size:15px;font-weight:700;color:#1e293b;">${esc(invoice.client_name)}</p>
        ${invoice.client_company ? `<p style="margin:4px 0 0;font-size:13px;color:#475569;">${esc(invoice.client_company)}</p>` : ''}
        ${invoice.client_email ? `<p style="margin:4px 0 0;font-size:13px;color:#475569;">Email: ${esc(invoice.client_email)}</p>` : ''}
        ${invoice.client_phone ? `<p style="margin:4px 0 0;font-size:13px;color:#475569;">Phone: ${esc(invoice.client_phone)}</p>` : ''}
      </div>
    </div>

    <!-- Line items -->
    <div style="padding:8px 48px 0;flex:1;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:${esc(primary)};color:#ffffff;">
            <th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;border-radius:6px 0 0 6px;">Description</th>
            <th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;border-radius:0 6px 6px 0;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsMarkup}
        </tbody>
      </table>

      <!-- Totals -->
      <div style="margin-top:24px;display:flex;justify-content:flex-end;">
        <div style="width:260px;">
          <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;color:#64748b;">
            <span>Subtotal:</span><span>${money(invoice.subtotal, invoice.currency)}</span>
          </div>
          ${gstRegistered ? `
          <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;color:#64748b;">
            <span>GST (10%):</span><span>${money(invoice.tax, invoice.currency)}</span>
          </div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:14px 0;border-top:2px solid ${esc(primary)};margin-top:8px;font-size:20px;font-weight:700;color:${esc(primary)};">
            <span>Total Due:</span><span>${money(invoice.total, invoice.currency)} ${esc(invoice.currency)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Payment information -->
    ${hasParsedPayment || bankDetails ? `
    <div style="margin:24px 48px 32px;padding:24px 28px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <h3 style="font-size:14px;font-weight:700;color:${esc(primary)};margin-bottom:14px;">Payment Information</h3>
      ${hasParsedPayment ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 40px;">
        ${paymentPairs.map(p => `<div style="font-size:13px;color:#475569;"><strong style="color:#1e293b;font-weight:600;">${esc(p.label)}:</strong> ${esc(p.value)}</div>`).join('\n        ')}
      </div>` : `
      <p style="font-size:13px;color:#475569;">${esc(bankDetails)}</p>`}
      ${termsText ? `
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
        ${esc(termsText)}
      </div>` : ''}
    </div>` : ''}

    <!-- Footer -->
    <div style="padding:20px 48px;border-top:1px solid #e2e8f0;margin-top:auto;text-align:center;">
      ${footerText ? `<p style="margin:0;font-size:12px;color:#64748b;">${esc(footerText)}</p>` : ''}
      <p style="margin:${footerText ? '8px' : '0'} 0 0;font-size:10px;color:#c0c7d0;">Generated by BitBit</p>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}
