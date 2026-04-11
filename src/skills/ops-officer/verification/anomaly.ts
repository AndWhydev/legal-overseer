/**
 * Anomaly detection for invoice processing
 *
 * Detects suspicious patterns: duplicates, unusual amounts, round numbers, timing.
 */

import type { Invoice, AnomalyFlag } from '../types.js';
import {
  getRecentInvoicesBySupplier,
  getAverageInvoiceAmount,
  findByNumberAndSupplier
} from '../../../db/repositories/invoices.js';
import { createSafeLogger } from '../../../governance/index.js';

const logger = createSafeLogger('OpsOfficer');

/**
 * Configuration for anomaly detection
 */
const CONFIG = {
  // Duplicate detection
  duplicateWindowDays: 7,
  duplicateAmountThreshold: 1.0, // Within $1 considered same amount

  // Amount anomaly detection
  amountMultiplierThreshold: 2.0, // >2x average is flagged

  // Round number detection
  roundNumberThreshold: 1000, // Flag exact thousands above this

  // Minimum invoices for average calculation
  minInvoicesForAverage: 3
};

/**
 * Check for duplicate invoice (same vendor, similar amount, recent)
 */
function checkDuplicate(
  invoice: Invoice,
  supplierId: string
): AnomalyFlag | null {
  // Check by invoice number first
  const existingByNumber = findByNumberAndSupplier(invoice.invoice_number, supplierId);
  if (existingByNumber) {
    return {
      type: 'duplicate',
      severity: 'critical',
      message: `Duplicate invoice number: ${invoice.invoice_number} was already processed on ${existingByNumber.invoice_date}`
    };
  }

  // Check by amount similarity in recent window
  const recentInvoices = getRecentInvoicesBySupplier(
    supplierId,
    CONFIG.duplicateWindowDays
  );

  for (const recent of recentInvoices) {
    const amountDiff = Math.abs(recent.total - invoice.total);
    if (amountDiff <= CONFIG.duplicateAmountThreshold) {
      return {
        type: 'duplicate',
        severity: 'critical',
        message: `Potential duplicate: Invoice ${recent.invoice_number} with same amount ($${recent.total}) was processed ${getDaysAgo(recent.created_at)} days ago`
      };
    }
  }

  return null;
}

/**
 * Calculate days since a date
 */
function getDaysAgo(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check for unusual amount compared to historical average
 */
function checkAmountAnomaly(
  invoice: Invoice,
  supplierId: string
): AnomalyFlag | null {
  const avgAmount = getAverageInvoiceAmount(supplierId);

  // Not enough history for comparison
  if (avgAmount === null || avgAmount === 0) {
    return null;
  }

  const multiplier = invoice.total / avgAmount;

  if (multiplier > CONFIG.amountMultiplierThreshold) {
    return {
      type: 'amount',
      severity: 'warning',
      message: `Unusual amount: $${invoice.total.toLocaleString()} is ${multiplier.toFixed(1)}x the historical average of $${avgAmount.toLocaleString()}`
    };
  }

  return null;
}

/**
 * Check for round number fraud pattern
 * Fraudulent invoices often have exact round numbers
 */
function checkRoundNumber(invoice: Invoice): AnomalyFlag | null {
  if (invoice.total > CONFIG.roundNumberThreshold && invoice.total % 1000 === 0) {
    return {
      type: 'round_number',
      severity: 'warning',
      message: `Suspicious round number: $${invoice.total.toLocaleString()} is exactly ${invoice.total / 1000}k - verify line item breakdown`
    };
  }

  return null;
}

/**
 * Check for timing anomalies (multiple invoices in short period)
 */
function checkTimingAnomaly(
  invoice: Invoice,
  supplierId: string
): AnomalyFlag | null {
  const recentInvoices = getRecentInvoicesBySupplier(supplierId, 7);

  // More than 3 invoices from same supplier in a week
  if (recentInvoices.length >= 3) {
    return {
      type: 'timing',
      severity: 'warning',
      message: `High frequency: ${recentInvoices.length + 1} invoices from this supplier in the past week`
    };
  }

  return null;
}

/**
 * Run all anomaly detection checks on an invoice
 *
 * @param invoice - Extracted invoice data
 * @param supplierId - Matched supplier ID (if any)
 * @returns Array of detected anomalies
 */
export function detectAnomalies(
  invoice: Invoice,
  supplierId: string | undefined
): AnomalyFlag[] {
  const anomalies: AnomalyFlag[] = [];

  // Can only run supplier-specific checks if we have a match
  if (supplierId) {
    // Duplicate check (critical)
    const duplicate = checkDuplicate(invoice, supplierId);
    if (duplicate) anomalies.push(duplicate);

    // Amount anomaly check (warning)
    const amountAnomaly = checkAmountAnomaly(invoice, supplierId);
    if (amountAnomaly) anomalies.push(amountAnomaly);

    // Timing anomaly check (warning)
    const timingAnomaly = checkTimingAnomaly(invoice, supplierId);
    if (timingAnomaly) anomalies.push(timingAnomaly);
  }

  // Round number check (doesn't need supplier)
  const roundNumber = checkRoundNumber(invoice);
  if (roundNumber) anomalies.push(roundNumber);

  // Log findings
  if (anomalies.length > 0) {
    logger.info(`Detected ${anomalies.length} anomalies for invoice ${invoice.invoice_number}`);
    for (const a of anomalies) {
      logger.info(`  - [${a.severity.toUpperCase()}] ${a.type}: ${a.message}`);
    }
  }

  return anomalies;
}
