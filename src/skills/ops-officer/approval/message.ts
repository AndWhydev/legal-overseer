/**
 * Invoice approval message generator
 *
 * Formats invoice data and anomalies for email-based HITL approval.
 */

import type { Invoice, VerificationResult, AnomalyFlag } from '../types.js';
import { escapeHtml } from '../../../email/notifier.js';

export interface InvoiceApprovalData {
  invoice: Invoice;
  verification: VerificationResult;
  anomalies: AnomalyFlag[];
  extractionConfidence: number;
  emailSubject?: string;
  invoiceRecordId?: string;
}

/**
 * Format currency amount for display
 */
function formatAmount(amount: number, currency: string = 'AUD'): string {
  const symbols: Record<string, string> = {
    AUD: 'A$',
    USD: '$',
    EUR: '€',
    GBP: '£',
    CNY: '¥'
  };
  const symbol = symbols[currency.toUpperCase()] ?? `${currency} `;
  return `${symbol}${amount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Get emoji for confidence level
 */
function getConfidenceEmoji(confidence: number): string {
  if (confidence >= 90) return '✅';
  if (confidence >= 70) return '⚠️';
  return '❌';
}

/**
 * Get emoji for anomaly severity
 */
function getAnomalyEmoji(severity: 'warning' | 'critical'): string {
  return severity === 'critical' ? '🚨' : '⚠️';
}

/**
 * Generate approval message for invoice
 */
export function generateInvoiceApprovalMessage(data: InvoiceApprovalData): string {
  const { invoice, verification, anomalies, extractionConfidence } = data;

  // Build header
  let message = `<b>📄 Invoice Approval Required</b>\n\n`;

  // Invoice details
  message += `<b>Supplier:</b> ${escapeHtml(invoice.vendor_name)}\n`;

  if (verification.matched && verification.supplierName) {
    message += `<b>Matched to:</b> ${escapeHtml(verification.supplierName)} `;
    message += verification.confidence === 100 ? '✅' : '⚠️';
    message += '\n';
  } else {
    message += `<b>⚠️ Unknown supplier</b>\n`;
  }

  message += `\n<b>Invoice #:</b> <code>${escapeHtml(invoice.invoice_number)}</code>\n`;
  message += `<b>Date:</b> ${escapeHtml(invoice.invoice_date)}\n`;

  if (invoice.due_date) {
    message += `<b>Due:</b> ${escapeHtml(invoice.due_date)}\n`;
  }

  // Amount breakdown
  message += `\n<b>💰 Amount</b>\n`;
  message += `Subtotal: ${formatAmount(invoice.subtotal, invoice.currency)}\n`;

  if (invoice.gst !== undefined && invoice.gst > 0) {
    message += `GST: ${formatAmount(invoice.gst, invoice.currency)}\n`;
  }

  message += `<b>Total: ${formatAmount(invoice.total, invoice.currency)}</b>\n`;

  // Line items summary
  if (invoice.line_items.length > 0) {
    message += `\n<b>📋 Items (${invoice.line_items.length})</b>\n`;
    const maxItems = 3;
    for (let i = 0; i < Math.min(invoice.line_items.length, maxItems); i++) {
      const item = invoice.line_items[i];
      const itemDesc = item.description.length > 40
        ? item.description.substring(0, 37) + '...'
        : item.description;
      message += `• ${escapeHtml(itemDesc)}: ${formatAmount(item.total, invoice.currency)}\n`;
    }
    if (invoice.line_items.length > maxItems) {
      message += `<i>...and ${invoice.line_items.length - maxItems} more items</i>\n`;
    }
  }

  // Extraction confidence
  message += `\n<b>📊 Extraction</b>\n`;
  message += `Confidence: ${getConfidenceEmoji(extractionConfidence)} ${extractionConfidence}%\n`;

  // Anomalies and flags
  const allFlags = [...anomalies, ...verification.flags];
  if (allFlags.length > 0) {
    message += `\n<b>⚠️ Flags (${allFlags.length})</b>\n`;
    for (const flag of allFlags) {
      message += `${getAnomalyEmoji(flag.severity)} ${escapeHtml(flag.message)}\n`;
    }
  }

  // Email context if available
  if (data.emailSubject) {
    message += `\n<i>From email: ${escapeHtml(data.emailSubject)}</i>\n`;
  }

  // Expiry warning
  message += `\n<i>⏰ This request expires in 24 hours.</i>`;

  return message;
}

/**
 * Generate action summary for approval record
 */
export function generateActionSummary(data: InvoiceApprovalData): string {
  const { invoice, anomalies, verification } = data;

  const flags = anomalies.filter(a => a.severity === 'critical').length;
  const warnings = anomalies.filter(a => a.severity === 'warning').length;

  let summary = `Invoice ${invoice.invoice_number} from ${invoice.vendor_name}`;
  summary += ` for ${formatAmount(invoice.total, invoice.currency)}`;

  if (flags > 0) {
    summary += ` [${flags} CRITICAL]`;
  }
  if (warnings > 0) {
    summary += ` [${warnings} warnings]`;
  }

  if (!verification.matched) {
    summary += ` [UNKNOWN SUPPLIER]`;
  }

  return summary;
}
