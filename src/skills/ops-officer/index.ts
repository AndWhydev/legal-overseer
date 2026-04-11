/**
 * Ops Officer Skill Module
 *
 * Invoice processing with OCR extraction, supplier verification,
 * anomaly detection, and Xero payment draft creation.
 *
 * Architecture:
 * - email/        - Gmail MCP email monitoring
 * - extraction/   - Claude Vision invoice extraction
 * - verification/ - Supplier verification and anomaly detection
 * - approval/     - HITL approval flow
 * - payment/      - Xero payment draft creation
 * - pipeline.ts   - Main orchestration
 *
 * Usage:
 * ```typescript
 * import { processInboxInvoices, handleApprovedInvoice } from './skills/ops-officer';
 *
 * // Scan inbox and process invoices
 * const { processed, failed, results } = await processInboxInvoices();
 *
 * // After HITL approval, create payment draft
 * const { xeroInvoiceId } = await handleApprovedInvoice(invoiceRecordId);
 * ```
 */

// Re-export all types
export * from './types.js';

// Re-export task context
export * from './task-context.js';

// Re-export pipeline orchestration (main entry point)
export * from './pipeline.js';

// Re-export submodules
export * from './email/index.js';
export * from './extraction/index.js';
export * from './verification/index.js';
export * from './approval/index.js';
export * from './payment/index.js';
