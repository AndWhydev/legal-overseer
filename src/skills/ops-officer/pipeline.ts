/**
 * Ops Officer invoice processing pipeline
 *
 * Orchestrates: Email scan -> Extract -> Verify -> Detect -> Approve -> Pay
 */

import { unlink } from 'node:fs/promises';
import { scanForInvoices, markInvoiceProcessed, type DetectedInvoice } from './email/index.js';
import { extractInvoiceFromPdf } from './extraction/index.js';
import { verifySupplier } from './verification/supplier.js';
import { detectAnomalies } from './verification/anomaly.js';
import { requestInvoiceApproval, getApprovalChatId } from './approval/index.js';
import { createDraftBill, isXeroConfigured } from './payment/index.js';
import { createInvoiceRecord, updateInvoiceStatus, findInvoiceById } from '../../db/repositories/invoices.js';
import { getSupplierEmails, findById as findSupplierById } from '../../db/repositories/suppliers.js';
import { createSafeLogger } from '../../governance/index.js';
import type { InvoiceProcessingResult } from './types.js';

const logger = createSafeLogger('OpsOfficer');

async function cleanupAttachment(attachmentPath: string): Promise<void> {
  try {
    await unlink(attachmentPath);
    logger.info('Cleaned up attachment file');
  } catch {
    logger.warn('Failed to clean up attachment file');
  }
}

/**
 * Process a single detected invoice through the pipeline
 */
export async function processInvoice(
  detected: DetectedInvoice
): Promise<InvoiceProcessingResult> {
  logger.info(`Processing invoice from ${detected.senderEmail}: ${detected.subject}`);

  // Step 1: Extract invoice data from PDF
  const extraction = await extractInvoiceFromPdf(detected.attachmentPath);

  if (!extraction.success || !extraction.invoice) {
    logger.error(`Extraction failed: ${extraction.error}`);
    await cleanupAttachment(detected.attachmentPath);
    return {
      success: false,
      anomalies: [],
      approvalRequired: false,
      error: extraction.error
    };
  }

  const invoice = extraction.invoice;

  // Step 2: Verify supplier
  const verification = verifySupplier(invoice);

  // Step 3: Detect anomalies (if supplier matched)
  const anomalies = detectAnomalies(invoice, verification.supplierId);

  // Combine all flags
  const allAnomalies = [...anomalies, ...verification.flags];

  // Step 4: Create invoice record in database
  let invoiceRecordId: string | undefined;
  if (verification.supplierId) {
    const record = createInvoiceRecord({
      supplierId: verification.supplierId,
      emailId: detected.emailId,
      invoice,
      confidenceScore: extraction.confidence
    });
    invoiceRecordId = record.id;
  }

  // Step 5: Determine if approval is needed
  // Always require approval for now (conservative approach)
  const approvalRequired = true;

  // Step 6: Send approval request
  const chatId = getApprovalChatId();
  if (!chatId) {
    return {
      success: false,
      invoice,
      verification,
      anomalies: allAnomalies,
      approvalRequired: true,
      error: 'Telegram chat ID not configured'
    };
  }

  const approvalResult = await requestInvoiceApproval(chatId, {
    invoice,
    verification,
    anomalies: allAnomalies,
    extractionConfidence: extraction.confidence,
    emailSubject: detected.subject,
    invoiceRecordId
  });

  // Step 7: Mark email as processed
  await markInvoiceProcessed(detected.emailId);
  await cleanupAttachment(detected.attachmentPath);

  return {
    success: true,
    invoice,
    verification,
    anomalies: allAnomalies,
    approvalRequired,
    approvalToken: approvalResult.approvalId
  };
}

/**
 * Scan inbox and process all pending invoices
 */
export async function processInboxInvoices(): Promise<{
  processed: number;
  failed: number;
  results: InvoiceProcessingResult[];
}> {
  logger.info('Scanning inbox for invoices...');

  // Get supplier emails for filtering
  const supplierEmails = getSupplierEmails();
  logger.info(`Filtering for ${supplierEmails.length} known supplier emails`);

  // Scan for invoices
  const detected = await scanForInvoices({ supplierEmails });
  logger.info(`Found ${detected.length} potential invoices`);

  const results: InvoiceProcessingResult[] = [];
  let processed = 0;
  let failed = 0;

  for (const invoice of detected) {
    const result = await processInvoice(invoice);
    results.push(result);

    if (result.success) {
      processed++;
    } else {
      failed++;
    }
  }

  logger.info(`Processed ${processed} invoices, ${failed} failed`);

  return { processed, failed, results };
}

/**
 * Handle approved invoice - create payment draft in Xero
 */
export async function handleApprovedInvoice(
  invoiceRecordId: string
): Promise<{ success: boolean; xeroInvoiceId?: string; error?: string }> {
  if (!isXeroConfigured()) {
    logger.warn('Xero not configured, skipping draft creation');
    return { success: false, error: 'Xero not configured' };
  }

  // Load invoice record
  const record = findInvoiceById(invoiceRecordId);

  if (!record) {
    return { success: false, error: 'Invoice record not found' };
  }

  if (!record.extraction_data) {
    return { success: false, error: 'No extraction data available' };
  }

  const invoice = JSON.parse(record.extraction_data);

  // Load supplier
  const supplier = findSupplierById(record.supplier_id);

  if (!supplier) {
    return { success: false, error: 'Supplier not found' };
  }

  // Create draft in Xero
  const result = await createDraftBill(
    invoice,
    supplier.name,
    supplier.contact_email ?? undefined
  );

  if (result.success && result.invoiceId) {
    // Update invoice record with Xero ID
    updateInvoiceStatus(invoiceRecordId, 'approved', undefined, result.invoiceId);
    logger.info(`Created Xero draft ${result.invoiceId} for invoice ${invoiceRecordId}`);
  }

  return {
    success: result.success,
    xeroInvoiceId: result.invoiceId,
    error: result.error
  };
}
