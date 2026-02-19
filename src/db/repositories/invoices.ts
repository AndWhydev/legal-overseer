/**
 * Invoice history repository for BitBit
 *
 * Tracks processed invoices for anomaly detection and audit trail.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../connection.js';
import type { Invoice as ExtractedInvoice } from '../../skills/ops-officer/types.js';

export interface InvoiceRecord {
  id: string;
  supplier_id: string;
  email_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  gst: number | null;
  total: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  approval_id: string | null;
  xero_invoice_id: string | null;
  confidence_score: number | null;
  extraction_data: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateInvoiceParams {
  supplierId: string;
  emailId?: string;
  invoice: ExtractedInvoice;
  confidenceScore: number;
}

/**
 * Create invoice record from extracted data
 */
export function createInvoiceRecord(params: CreateInvoiceParams): InvoiceRecord {
  const db = getDatabase();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO invoices (
      id, supplier_id, email_id, invoice_number, invoice_date, due_date,
      subtotal, gst, total, currency, status, confidence_score, extraction_data
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    id,
    params.supplierId,
    params.emailId ?? null,
    params.invoice.invoice_number,
    params.invoice.invoice_date,
    params.invoice.due_date ?? null,
    params.invoice.subtotal,
    params.invoice.gst ?? null,
    params.invoice.total,
    params.invoice.currency,
    params.confidenceScore,
    (() => {
      const { bank_details, ...sanitizedInvoice } = params.invoice as Record<string, unknown>;
      return JSON.stringify(sanitizedInvoice);
    })()
  );

  return findInvoiceById(id)!;
}

/**
 * Find invoice by ID
 */
export function findInvoiceById(id: string): InvoiceRecord | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRecord | undefined ?? null;
}

/**
 * Get recent invoices for a supplier (for duplicate detection)
 */
export function getRecentInvoicesBySupplier(
  supplierId: string,
  daysBack: number
): InvoiceRecord[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM invoices
    WHERE supplier_id = ?
      AND created_at > datetime('now', '-' || ? || ' days')
    ORDER BY created_at DESC
  `).all(supplierId, daysBack) as InvoiceRecord[];
}

/**
 * Get average invoice amount for a supplier
 */
export function getAverageInvoiceAmount(supplierId: string): number | null {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT AVG(total) as avg_total
    FROM invoices
    WHERE supplier_id = ?
      AND status IN ('approved', 'paid')
  `).get(supplierId) as { avg_total: number | null } | undefined;

  return result?.avg_total ?? null;
}

/**
 * Update invoice status
 */
export function updateInvoiceStatus(
  id: string,
  status: 'pending' | 'approved' | 'rejected' | 'paid',
  approvalId?: string,
  xeroInvoiceId?: string
): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE invoices
    SET status = ?,
        approval_id = COALESCE(?, approval_id),
        xero_invoice_id = COALESCE(?, xero_invoice_id),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(status, approvalId ?? null, xeroInvoiceId ?? null, id);
}

/**
 * Find invoice by number and supplier (for duplicate detection)
 */
export function findByNumberAndSupplier(
  invoiceNumber: string,
  supplierId: string
): InvoiceRecord | null {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM invoices
    WHERE LOWER(invoice_number) = LOWER(?)
      AND supplier_id = ?
  `).get(invoiceNumber, supplierId) as InvoiceRecord | undefined ?? null;
}
