/**
 * Supplier verification module
 *
 * Verifies extracted vendor names against approved supplier list.
 * Uses exact match first, then fuzzy matching for minor variations.
 */

import { createHmac } from 'node:crypto';
import {
  getActiveSuppliers,
  findByName,
  findByEmail,
  type Supplier
} from '../../../db/repositories/suppliers.js';
import type { Invoice, VerificationResult, AnomalyFlag } from '../types.js';
import { createSafeLogger } from '../../../governance/index.js';

const logger = createSafeLogger('OpsOfficer');

/**
 * Calculate similarity between two strings (Levenshtein-based)
 * Returns 0-1 where 1 is exact match
 */
function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  if (aLower === bLower) return 1;
  if (aLower.length === 0 || bLower.length === 0) return 0;

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= aLower.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= aLower.length; i++) {
    for (let j = 1; j <= bLower.length; j++) {
      if (aLower[i - 1] === bLower[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  const distance = matrix[aLower.length][bLower.length];
  const maxLen = Math.max(aLower.length, bLower.length);
  return 1 - distance / maxLen;
}

/**
 * Find best fuzzy match among suppliers
 */
function findBestMatch(
  vendorName: string,
  suppliers: Supplier[],
  threshold: number
): { supplier: Supplier; similarity: number } | null {
  let bestMatch: { supplier: Supplier; similarity: number } | null = null;

  for (const supplier of suppliers) {
    const similarity = calculateSimilarity(vendorName, supplier.name);
    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { supplier, similarity };
    }
  }

  return bestMatch;
}

const BANK_HASH_SECRET = process.env.BANK_HASH_SECRET;

/**
 * Hash bank details for comparison
 */
export function hashBankDetails(details: {
  bsb?: string;
  account_number?: string;
}): string {
  if (!BANK_HASH_SECRET) {
    throw new Error('BANK_HASH_SECRET environment variable is required for bank details hashing');
  }
  const normalized = `${details.bsb ?? ''}:${details.account_number ?? ''}`.toLowerCase().replace(/\s/g, '');
  return createHmac('sha256', BANK_HASH_SECRET).update(normalized).digest('hex');
}

/**
 * Verify supplier from extracted invoice
 *
 * @param invoice - Extracted invoice data
 * @returns Verification result with matched supplier or flags
 */
export function verifySupplier(invoice: Invoice): VerificationResult {
  const flags: AnomalyFlag[] = [];

  // Try exact name match first
  let supplier = findByName(invoice.vendor_name);

  // Try email match if provided
  if (!supplier && invoice.vendor_email) {
    supplier = findByEmail(invoice.vendor_email);
  }

  // Try fuzzy match
  if (!supplier) {
    const activeSuppliers = getActiveSuppliers();
    const fuzzyMatch = findBestMatch(invoice.vendor_name, activeSuppliers, 0.8);

    if (fuzzyMatch) {
      supplier = fuzzyMatch.supplier;
      logger.info(`Fuzzy matched vendor to supplier (${Math.round(fuzzyMatch.similarity * 100)}% similarity)`);
    }
  }

  // No match found
  if (!supplier) {
    logger.info('Unknown supplier: vendor not in approved list');
    return {
      matched: false,
      confidence: 0,
      flags: [{
        type: 'unknown_supplier',
        severity: 'critical',
        message: `Unknown supplier: "${invoice.vendor_name}" not in approved list`
      }]
    };
  }

  // Check supplier status
  if (supplier.status === 'suspended') {
    flags.push({
      type: 'unknown_supplier', // Reusing type for now
      severity: 'critical',
      message: `Supplier "${supplier.name}" is suspended`
    });
  }

  if (supplier.status === 'blacklisted') {
    flags.push({
      type: 'unknown_supplier',
      severity: 'critical',
      message: `Supplier "${supplier.name}" is blacklisted - DO NOT PAY`
    });
  }

  // Check bank details if available
  if (invoice.bank_details && (invoice.bank_details.bsb || invoice.bank_details.account_number)) {
    const invoiceBankHash = hashBankDetails({
      bsb: invoice.bank_details.bsb,
      account_number: invoice.bank_details.account_number
    });

    if (supplier.bank_details_hash) {
      if (invoiceBankHash !== supplier.bank_details_hash) {
        flags.push({
          type: 'bank_mismatch',
          severity: 'critical',
          message: `Bank details on invoice do not match stored details for ${supplier.name}. VERIFY BEFORE PAYMENT.`
        });
      }
    } else {
      // First time seeing bank details - flag for verification
      flags.push({
        type: 'bank_mismatch',
        severity: 'warning',
        message: `First bank details recorded for ${supplier.name}. Please verify independently.`
      });
    }
  }

  // Calculate confidence
  const confidence = flags.some(f => f.severity === 'critical') ? 30 :
                    flags.some(f => f.severity === 'warning') ? 70 : 100;

  return {
    matched: true,
    supplierId: supplier.id,
    supplierName: supplier.name,
    confidence,
    flags
  };
}
