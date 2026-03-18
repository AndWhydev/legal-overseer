import { NextRequest, NextResponse } from 'next/server'
import { generateInvoicePdf, type InvoicePdfInput, type InvoicePdfSettings } from '@/lib/agent/invoice-pdf'

export const dynamic = 'force-dynamic'

/**
 * GET /api/invoices/render?data=<base64-json>
 * Opens a styled invoice page from base64-encoded invoice data.
 */
export async function GET(request: NextRequest) {
  const dataParam = request.nextUrl.searchParams.get('data')
  if (!dataParam) return NextResponse.json({ error: 'Missing data' }, { status: 400 })

  try {
    const { invoice, settings } = JSON.parse(Buffer.from(dataParam, 'base64').toString('utf-8'))
    const result = generateInvoicePdf(invoice, settings)
    const printableHtml = result.html.replace('</head>', `<style>@media print { body { padding: 0 !important; background: white !important; } @page { margin: 0.4in; size: A4; } } .print-controls { position: fixed; top: 16px; right: 16px; z-index: 100; } .print-controls button { padding: 8px 16px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; font-size: 13px; cursor: pointer; } @media print { .print-controls { display: none !important; } }</style></head>`).replace('<body', '<body><div class="print-controls"><button onclick="window.print()">Save as PDF</button></div')
    return new NextResponse(printableHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  } catch {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }
}

/**
 * POST /api/invoices/render
 *
 * Renders a styled HTML invoice page. Returns full HTML document that can be:
 * 1. Opened in a new tab for viewing
 * 2. Printed to PDF via browser (Cmd+P → Save as PDF)
 * 3. Embedded in an email as HTML body
 *
 * Body: { invoice: InvoicePdfInput, settings?: InvoicePdfSettings, returnType?: 'html' | 'json' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      invoice: InvoicePdfInput
      settings?: InvoicePdfSettings
      returnType?: 'html' | 'json'
    }

    if (!body.invoice) {
      return NextResponse.json({ error: 'Missing invoice data' }, { status: 400 })
    }

    const result = generateInvoicePdf(body.invoice, body.settings)

    // Add print-optimized CSS
    const printableHtml = result.html.replace(
      '</head>',
      `<style>
        @media print {
          body { padding: 0 !important; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 0.4in; size: A4; }
        }
        /* Download/print button */
        .print-controls { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 100; }
        .print-controls button {
          padding: 8px 16px; border-radius: 8px; border: 1px solid #e2e8f0;
          background: white; font-size: 13px; font-weight: 500; cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: all 0.15s;
        }
        .print-controls button:hover { background: #f8fafc; border-color: #cbd5e1; }
        @media print { .print-controls { display: none !important; } }
      </style>
      </head>`
    ).replace(
      '<body',
      `<body><div class="print-controls">
        <button onclick="window.print()">Save as PDF</button>
      </div><div style="display:none" id="invoice-data">${Buffer.from(JSON.stringify(body.invoice)).toString('base64')}</div`
    )

    if (body.returnType === 'json') {
      return NextResponse.json({ html: printableHtml, subject: result.subject })
    }

    return new NextResponse(printableHtml, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request' },
      { status: 400 }
    )
  }
}
