/**
 * Invoice extraction schemas
 *
 * Zod schemas for validation and JSON schema for Claude structured outputs.
 */

import { z } from 'zod';

// Re-export from types for convenience
export { InvoiceSchema, InvoiceLineItemSchema, type Invoice, type InvoiceLineItem } from '../types.js';

/**
 * JSON Schema representation of Invoice for Claude structured outputs
 *
 * This must match the Zod schema exactly.
 */
export const InvoiceJsonSchema = {
  type: 'object',
  properties: {
    vendor_name: { type: 'string', description: 'Supplier/vendor company name' },
    vendor_email: { type: 'string', description: 'Vendor contact email if present' },
    vendor_address: { type: 'string', description: 'Vendor address if present' },
    invoice_number: { type: 'string', description: 'Invoice reference number' },
    invoice_date: { type: 'string', description: 'Invoice issue date in YYYY-MM-DD format' },
    due_date: { type: 'string', description: 'Payment due date in YYYY-MM-DD format if present' },
    purchase_order: { type: 'string', description: 'Related PO number if present' },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Line item description' },
          quantity: { type: 'number', description: 'Quantity ordered' },
          unit_price: { type: 'number', description: 'Price per unit in AUD' },
          total: { type: 'number', description: 'Line total' }
        },
        required: ['description', 'quantity', 'unit_price', 'total']
      },
      description: 'Invoice line items'
    },
    subtotal: { type: 'number', description: 'Subtotal before tax' },
    gst: { type: 'number', description: 'GST amount if present' },
    total: { type: 'number', description: 'Total amount due in AUD' },
    currency: { type: 'string', description: 'Invoice currency (default AUD)' },
    bank_details: {
      type: 'object',
      properties: {
        bank_name: { type: 'string' },
        account_name: { type: 'string' },
        bsb: { type: 'string' },
        account_number: { type: 'string' }
      },
      description: 'Payment bank details if present'
    },
    confidence_score: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Extraction confidence 0-100 based on clarity and completeness'
    }
  },
  required: ['vendor_name', 'invoice_number', 'invoice_date', 'line_items', 'subtotal', 'total', 'confidence_score']
} as const;
