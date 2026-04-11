/**
 * Supplier repository module for BitBit
 *
 * Provides data access layer for the suppliers table.
 * Used by Ops Officer for invoice verification.
 */

import { getDatabase } from '../connection.js';

/**
 * Supplier entity representing a row in the suppliers table
 */
export interface Supplier {
  id: string;
  name: string;
  contact_email: string | null;
  bank_details_hash: string | null;
  status: 'active' | 'suspended' | 'blacklisted';
  reliability_score: number;
  total_paid: number;
  last_order_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get all active suppliers
 */
export function getActiveSuppliers(): Supplier[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM suppliers
    WHERE status = 'active'
    ORDER BY name
  `).all() as Supplier[];
}

/**
 * Get all suppliers (any status)
 */
export function getAllSuppliers(): Supplier[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM suppliers
    ORDER BY name
  `).all() as Supplier[];
}

/**
 * Find supplier by exact name (case-insensitive)
 */
export function findByName(name: string): Supplier | null {
  const db = getDatabase();
  const supplier = db.prepare(`
    SELECT * FROM suppliers
    WHERE LOWER(name) = LOWER(?)
  `).get(name) as Supplier | undefined;
  return supplier ?? null;
}

/**
 * Find supplier by ID
 */
export function findById(id: string): Supplier | null {
  const db = getDatabase();
  const supplier = db.prepare(`
    SELECT * FROM suppliers
    WHERE id = ?
  `).get(id) as Supplier | undefined;
  return supplier ?? null;
}

/**
 * Find supplier by email (case-insensitive)
 */
export function findByEmail(email: string): Supplier | null {
  const db = getDatabase();
  const supplier = db.prepare(`
    SELECT * FROM suppliers
    WHERE LOWER(contact_email) = LOWER(?)
  `).get(email) as Supplier | undefined;
  return supplier ?? null;
}

/**
 * Update supplier's total paid amount
 */
export function updateTotalPaid(id: string, amount: number): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE suppliers
    SET total_paid = total_paid + ?,
        last_order_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(amount, id);
}

/**
 * Get supplier emails for inbox monitoring filter
 */
export function getSupplierEmails(): string[] {
  const db = getDatabase();
  const results = db.prepare(`
    SELECT contact_email FROM suppliers
    WHERE contact_email IS NOT NULL AND status = 'active'
  `).all() as { contact_email: string }[];
  return results.map(r => r.contact_email);
}
