/**
 * Ops Officer Skill Type Definitions
 *
 * Types for invoice processing including OCR extraction,
 * supplier verification, anomaly detection, and Xero payment drafts.
 */

import { z } from 'zod';

// Invoice line item schema
export const InvoiceLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  total: z.number().nonnegative()
});

// Full invoice schema for Claude Vision extraction
export const InvoiceSchema = z.object({
  vendor_name: z.string(),
  vendor_email: z.string().email().optional(),
  vendor_address: z.string().optional(),
  invoice_number: z.string(),
  invoice_date: z.string(), // YYYY-MM-DD
  due_date: z.string().optional(),
  purchase_order: z.string().optional(),
  line_items: z.array(InvoiceLineItemSchema),
  subtotal: z.number().nonnegative(),
  gst: z.number().nonnegative().optional(),
  total: z.number().nonnegative(),
  currency: z.string().default('AUD'),
  bank_details: z.object({
    bank_name: z.string().optional(),
    account_name: z.string().optional(),
    bsb: z.string().optional(),
    account_number: z.string().optional()
  }).optional(),
  confidence_score: z.number().min(0).max(100)
});

export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;

/**
 * Anomaly type classifications for invoice processing
 */
export type AnomalyType =
  | 'duplicate'
  | 'amount'
  | 'timing'
  | 'round_number'
  | 'bank_mismatch'
  | 'unknown_supplier';

/**
 * Severity levels for anomaly flags
 */
export type AnomalySeverity = 'warning' | 'critical';

/**
 * Anomaly flag raised during invoice processing
 */
export interface AnomalyFlag {
  type: AnomalyType;
  severity: AnomalySeverity;
  message: string;
}

/**
 * Supplier verification result from matching against approved list
 */
export interface VerificationResult {
  /** Whether supplier was matched against approved list */
  matched: boolean;
  /** Database supplier ID if matched */
  supplierId?: string;
  /** Matched supplier name from database */
  supplierName?: string;
  /** Match confidence (0-100) */
  confidence: number;
  /** Any anomaly flags raised during verification */
  flags: AnomalyFlag[];
}

/**
 * Complete result from invoice processing pipeline
 */
export interface InvoiceProcessingResult {
  /** Whether processing completed successfully */
  success: boolean;
  /** Extracted invoice data */
  invoice?: Invoice;
  /** Supplier verification result */
  verification?: VerificationResult;
  /** All anomalies detected during processing */
  anomalies: AnomalyFlag[];
  /** Whether HITL approval is required before payment */
  approvalRequired: boolean;
  /** Approval token for HITL flow */
  approvalToken?: string;
  /** Error message if processing failed */
  error?: string;
}

/**
 * Result from creating a draft in Xero
 */
export interface XeroDraftResult {
  /** Whether draft was created successfully */
  success: boolean;
  /** Xero invoice ID */
  invoiceId?: string;
  /** Xero invoice number */
  invoiceNumber?: string;
  /** Error message if draft creation failed */
  error?: string;
}
