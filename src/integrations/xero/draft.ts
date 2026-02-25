/**
 * Xero draft invoice (bill) creation
 *
 * Creates DRAFT bills in Xero for approved invoices.
 * CRITICAL: NEVER sets status to AUTHORISED.
 */

import { Invoice as XeroInvoice, LineItem, Contact, CurrencyCode } from 'xero-node';
import { getXeroClient, ensureValidToken } from './client.js';
import type { Invoice as ExtractedInvoice, XeroDraftResult } from '../../skills/ops-officer/types.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('XeroDraft');

/**
 * Find or create a contact in Xero for the supplier
 */
async function findOrCreateContact(
  tenantId: string,
  supplierName: string,
  supplierEmail?: string
): Promise<string> {
  const xero = getXeroClient();

  // Search for existing contact
  const contacts = await xero.accountingApi.getContacts(
    tenantId,
    undefined,
    `Name=="${supplierName}"`
  );

  if (contacts.body.contacts && contacts.body.contacts.length > 0) {
    return contacts.body.contacts[0].contactID!;
  }

  // Create new contact
  const newContact: Contact = {
    name: supplierName,
    emailAddress: supplierEmail
  };

  const created = await xero.accountingApi.createContacts(tenantId, {
    contacts: [newContact]
  });

  return created.body.contacts![0].contactID!;
}

/**
 * Create a DRAFT bill (accounts payable invoice) in Xero
 *
 * @param invoice - Extracted invoice data
 * @param supplierName - Verified supplier name
 * @param supplierEmail - Optional supplier email
 * @returns Result with Xero invoice ID or error
 */
export async function createDraftBill(
  invoice: ExtractedInvoice,
  supplierName: string,
  supplierEmail?: string
): Promise<XeroDraftResult> {
  try {
    const tenantId = await ensureValidToken();
    const xero = getXeroClient();

    // Find or create contact
    const contactId = await findOrCreateContact(tenantId, supplierName, supplierEmail);

    // Map line items
    const lineItems: LineItem[] = invoice.line_items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitAmount: item.unit_price,
      accountCode: process.env.XERO_DEFAULT_ACCOUNT_CODE || '400' // Purchases account
    }));

    // Create DRAFT bill
    const xeroBill: XeroInvoice = {
      type: XeroInvoice.TypeEnum.ACCPAY, // Accounts Payable (bill to pay)
      contact: { contactID: contactId },
      date: invoice.invoice_date,
      dueDate: invoice.due_date,
      lineItems,
      reference: invoice.invoice_number,
      currencyCode: invoice.currency as unknown as CurrencyCode,
      status: XeroInvoice.StatusEnum.DRAFT // CRITICAL: Always DRAFT, never AUTHORISED
    };

    logger.info(`Creating DRAFT bill for ${supplierName}, ${invoice.currency} ${invoice.total}`);

    const result = await xero.accountingApi.createInvoices(
      tenantId,
      { invoices: [xeroBill] },
      true
    );

    const createdInvoice = result.body.invoices?.[0];

    if (!createdInvoice || !createdInvoice.invoiceID) {
      return {
        success: false,
        error: 'Failed to create invoice in Xero'
      };
    }

    logger.info(`Created DRAFT bill ${createdInvoice.invoiceNumber} (ID: ${createdInvoice.invoiceID})`);

    return {
      success: true,
      invoiceId: createdInvoice.invoiceID,
      invoiceNumber: createdInvoice.invoiceNumber
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to create draft bill: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Get Xero authorization URL for initial OAuth flow
 * User visits this URL to authorize the app
 */
export async function getAuthorizationUrl(): Promise<string> {
  const xero = getXeroClient();
  const consentUrl = await xero.buildConsentUrl();
  return consentUrl;
}
