/**
 * Gmail email monitoring for invoice detection
 *
 * This module provides Gmail MCP integration for:
 * - Searching for emails with PDF attachments
 * - Detecting invoice-related emails from suppliers
 * - Downloading attachments for OCR processing
 * - Marking emails as processed
 *
 * @example
 * ```typescript
 * import { scanForInvoices, markInvoiceProcessed } from './skills/ops-officer/email';
 *
 * // Scan for invoices from known suppliers
 * const invoices = await scanForInvoices({
 *   supplierEmails: ['billing@supplier.com'],
 *   sinceDays: 7
 * });
 *
 * for (const invoice of invoices) {
 *   // Process the invoice PDF...
 *   await markInvoiceProcessed(invoice.emailId, 'BitBit/Processed');
 * }
 * ```
 */

// Client exports - low-level Gmail MCP wrappers
export {
  searchEmails,
  readEmail,
  downloadAttachment,
  markAsRead,
  addLabels,
  getOrCreateLabel,
  getGmailMcpConfig,
  type GmailSearchResult,
  type GmailAttachment,
  type GmailEmail,
} from './client.js';

// Monitor exports - high-level invoice detection
export {
  scanForInvoices,
  markInvoiceProcessed,
  scanSupplierInvoices,
  getInvoiceDirectory,
  type DetectedInvoice,
  type ScanOptions,
} from './monitor.js';
