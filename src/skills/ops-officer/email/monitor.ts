/**
 * Email monitor for invoice detection
 *
 * Monitors inbox for emails with PDF invoices from suppliers.
 * Filters by invoice-related keywords and downloads PDF attachments.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { createSafeLogger } from '../../../governance/index.js';

const logger = createSafeLogger('OpsOfficer');
import {
  searchEmails,
  readEmail,
  downloadAttachment,
  markAsRead,
  addLabels,
  getOrCreateLabel,
  type GmailSearchResult,
} from './client.js';

/**
 * Invoice-related keywords to detect in email subjects
 */
const INVOICE_KEYWORDS = [
  'invoice',
  'inv',
  'bill',
  'statement',
  'receipt',
  'payment',
  'remittance',
  'tax invoice',
];

/**
 * Default temp directory for downloaded invoices
 */
const DEFAULT_INVOICE_DIR = '/data/tmp/invoices';

/**
 * A detected invoice from email
 */
export interface DetectedInvoice {
  /** Gmail message ID */
  emailId: string;
  /** Gmail thread ID */
  threadId: string;
  /** Email subject line */
  subject: string;
  /** Sender email address */
  senderEmail: string;
  /** Sender display name */
  senderName: string;
  /** Email received timestamp */
  receivedAt: string;
  /** Local path to downloaded PDF */
  attachmentPath: string;
  /** Original attachment filename */
  attachmentFilename: string;
}

/**
 * Options for invoice scanning
 */
export interface ScanOptions {
  /** List of known supplier email addresses to filter by */
  supplierEmails?: string[];
  /** How far back to search in days (default 7) */
  sinceDays?: number;
  /** Maximum emails to process (default 20) */
  maxResults?: number;
  /** Directory to save downloaded invoices */
  saveDir?: string;
}

/**
 * Parse sender email and name from "Name <email@domain.com>" format
 *
 * @param from - Email from header value
 * @returns Parsed name and email
 */
function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ''),
      email: match[2].toLowerCase(),
    };
  }
  // If no angle brackets, treat entire string as email
  return { name: from, email: from.toLowerCase() };
}

/**
 * Check if email subject indicates an invoice
 *
 * @param subject - Email subject line
 * @returns true if subject contains invoice-related keywords
 */
function isInvoiceSubject(subject: string): boolean {
  const lower = subject.toLowerCase();
  return INVOICE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * Build Gmail search query for invoice detection
 *
 * @param options - Scan options
 * @returns Gmail search query string
 */
function buildSearchQuery(options: ScanOptions): string {
  const parts: string[] = [];

  // Must have PDF attachment and be unread
  parts.push('has:attachment filename:pdf is:unread');

  // Date filter
  const sinceDays = options.sinceDays ?? 7;
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);
  const dateStr = sinceDate.toISOString().split('T')[0].replace(/-/g, '/');
  parts.push(`after:${dateStr}`);

  // Sender filter if provided
  if (options.supplierEmails && options.supplierEmails.length > 0) {
    const fromFilter = options.supplierEmails
      .map((e) => `from:${e}`)
      .join(' OR ');
    parts.push(`(${fromFilter})`);
  }

  return parts.join(' ');
}

/**
 * Scan inbox for unread invoices with PDF attachments
 *
 * Searches for unread emails with PDF attachments, filters by invoice-related
 * subjects, and downloads the PDF attachments for processing.
 *
 * @param options - Scan configuration options
 * @returns List of detected invoices with downloaded attachments
 *
 * @example
 * ```typescript
 * // Scan for invoices from known suppliers
 * const invoices = await scanForInvoices({
 *   supplierEmails: ['billing@supplier.com', 'invoices@vendor.com'],
 *   sinceDays: 14
 * });
 *
 * for (const invoice of invoices) {
 *   console.log(`Found: ${invoice.subject} -> ${invoice.attachmentPath}`);
 * }
 * ```
 */
export async function scanForInvoices(
  options: ScanOptions = {}
): Promise<DetectedInvoice[]> {
  const query = buildSearchQuery(options);
  const maxResults = options.maxResults ?? 20;
  const saveDir = options.saveDir ?? DEFAULT_INVOICE_DIR;

  logger.info(`Searching emails: ${query}`);

  // Ensure temp directory exists
  try {
    await mkdir(saveDir, { recursive: true });
  } catch (error) {
    logger.error(`Failed to create directory ${saveDir}:`, error);
    throw error;
  }

  const searchResults = await searchEmails(query, maxResults);
  const invoices: DetectedInvoice[] = [];

  logger.info(`Found ${searchResults.length} emails to check`);

  for (const result of searchResults) {
    try {
      // Filter by invoice-related subjects
      if (!isInvoiceSubject(result.subject)) {
        logger.info(`Skipping non-invoice: ${result.subject}`);
        continue;
      }

      // Read full email to get attachments
      const email = await readEmail(result.id);

      // Find PDF attachments
      const pdfAttachments = email.attachments.filter(
        (a) =>
          a.mimeType === 'application/pdf' ||
          a.filename.toLowerCase().endsWith('.pdf')
      );

      if (pdfAttachments.length === 0) {
        logger.info(`No PDF attachments in: ${result.subject}`);
        continue;
      }

      // Download first PDF attachment (primary invoice)
      const attachment = pdfAttachments[0];
      const uniqueId = nanoid(8);
      const safeFilename = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueFilename = `${uniqueId}_${safeFilename}`;

      const downloadPath = await downloadAttachment(
        result.id,
        attachment.id,
        saveDir,
        uniqueFilename
      );

      const sender = parseSender(email.from);

      invoices.push({
        emailId: result.id,
        threadId: result.threadId,
        subject: result.subject,
        senderEmail: sender.email,
        senderName: sender.name,
        receivedAt: email.date,
        attachmentPath: downloadPath,
        attachmentFilename: attachment.filename,
      });

      logger.info(
        `Detected invoice: "${result.subject}" from ${sender.email}`
      );
    } catch (error) {
      logger.error(
        `Error processing email ${result.id}:`,
        error
      );
      // Continue processing other emails
    }
  }

  logger.info(`Detected ${invoices.length} invoices`);
  return invoices;
}

/**
 * Mark invoice email as processed
 *
 * Marks the email as read and optionally adds a processing label.
 *
 * @param emailId - Gmail message ID
 * @param labelName - Optional label name to add (e.g., "BitBit/Processed")
 *
 * @example
 * ```typescript
 * // Mark as processed with custom label
 * await markInvoiceProcessed('msg123', 'BitBit/Invoices/Processed');
 *
 * // Just mark as read
 * await markInvoiceProcessed('msg123');
 * ```
 */
export async function markInvoiceProcessed(
  emailId: string,
  labelName?: string
): Promise<void> {
  // Mark as read
  await markAsRead(emailId);

  // Add label if specified
  if (labelName) {
    try {
      const labelId = await getOrCreateLabel(labelName);
      await addLabels(emailId, [labelId]);
    } catch (error) {
      logger.warn(
        `Failed to add label "${labelName}" to ${emailId}:`,
        error
      );
    }
  }

  logger.info(`Marked email ${emailId} as processed`);
}

/**
 * Scan for invoices from a specific supplier
 *
 * Convenience wrapper that filters for a single supplier email.
 *
 * @param supplierEmail - Supplier's email address
 * @param sinceDays - How far back to search (default 7)
 * @returns List of detected invoices
 *
 * @example
 * ```typescript
 * const invoices = await scanSupplierInvoices('billing@acme.com', 30);
 * ```
 */
export async function scanSupplierInvoices(
  supplierEmail: string,
  sinceDays = 7
): Promise<DetectedInvoice[]> {
  return scanForInvoices({
    supplierEmails: [supplierEmail],
    sinceDays,
  });
}

/**
 * Get the default invoice download directory
 *
 * @returns Default directory path for invoice downloads
 */
export function getInvoiceDirectory(): string {
  return DEFAULT_INVOICE_DIR;
}
