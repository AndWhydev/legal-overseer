/**
 * Clients repository.
 *
 * The `clients` table is the firm's CRM record for each person or
 * organisation the firm acts for. Distinct from `matters` (each
 * matter is one engagement; a client can have many matters).
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { appendLegalAudit } from '../compliance/audit.js';

export type ClientType = 'individual' | 'company' | 'trust' | 'government';
export type ClientStatus = 'prospect' | 'active' | 'closed';

export interface Client {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  company_name: string | null;
  abn: string | null;
  client_type: ClientType;
  status: ClientStatus;
  relationship_partner_email: string | null;
  referral_source: string | null;
  referring_client_id: string | null;
  referring_professional: string | null;
  identity_verified: number;
  identity_verified_at: string | null;
  identity_verified_by: string | null;
  engagement_letter_signed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateClientInput {
  full_name: string;
  email?: string;
  phone?: string;
  address?: string;
  company_name?: string;
  abn?: string;
  client_type?: ClientType;
  status?: ClientStatus;
  relationship_partner_email?: string;
  referral_source?: string;
  referring_client_id?: string;
  referring_professional?: string;
  notes?: string;
  acting: string;
}

export function createClient(input: CreateClientInput): Client {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO clients
       (id, full_name, email, phone, address, company_name, abn,
        client_type, status, relationship_partner_email,
        referral_source, referring_client_id, referring_professional,
        identity_verified, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  ).run(
    id,
    input.full_name,
    input.email ?? null,
    input.phone ?? null,
    input.address ?? null,
    input.company_name ?? null,
    input.abn ?? null,
    input.client_type ?? 'individual',
    input.status ?? 'prospect',
    input.relationship_partner_email ?? null,
    input.referral_source ?? null,
    input.referring_client_id ?? null,
    input.referring_professional ?? null,
    input.notes ?? null,
    now,
    now,
  );
  appendLegalAudit({
    matterId: null,
    actorId: input.acting,
    action: 'client.create',
    detail: input.full_name,
    refTable: 'clients',
    refId: id,
  });
  return getClient(id) as Client;
}

export function getClient(id: string): Client | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Client | undefined) ?? null
  );
}

export function getClientByEmail(email: string): Client | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM clients WHERE email = ?').get(email.toLowerCase()) as
      | Client
      | undefined) ?? null
  );
}

export function listClients(status?: ClientStatus): Client[] {
  const db = getDatabase();
  if (status) {
    return db
      .prepare(`SELECT * FROM clients WHERE status = ? ORDER BY full_name`)
      .all(status) as Client[];
  }
  return db.prepare(`SELECT * FROM clients ORDER BY full_name`).all() as Client[];
}

export function updateClient(id: string, patch: Partial<CreateClientInput>): Client | null {
  const existing = getClient(id);
  if (!existing) return null;
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE clients SET
       full_name = COALESCE(?, full_name),
       email = COALESCE(?, email),
       phone = COALESCE(?, phone),
       address = COALESCE(?, address),
       company_name = COALESCE(?, company_name),
       abn = COALESCE(?, abn),
       client_type = COALESCE(?, client_type),
       status = COALESCE(?, status),
       relationship_partner_email = COALESCE(?, relationship_partner_email),
       referral_source = COALESCE(?, referral_source),
       referring_client_id = COALESCE(?, referring_client_id),
       referring_professional = COALESCE(?, referring_professional),
       notes = COALESCE(?, notes),
       updated_at = ?
     WHERE id = ?`,
  ).run(
    patch.full_name ?? null,
    patch.email ?? null,
    patch.phone ?? null,
    patch.address ?? null,
    patch.company_name ?? null,
    patch.abn ?? null,
    patch.client_type ?? null,
    patch.status ?? null,
    patch.relationship_partner_email ?? null,
    patch.referral_source ?? null,
    patch.referring_client_id ?? null,
    patch.referring_professional ?? null,
    patch.notes ?? null,
    now,
    id,
  );
  return getClient(id);
}

export function setIdentityVerified(id: string, verifiedBy: string): Client {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE clients SET identity_verified = 1, identity_verified_at = ?, identity_verified_by = ?, updated_at = ? WHERE id = ?`,
  ).run(now, verifiedBy, now, id);
  appendLegalAudit({
    matterId: null,
    actorId: verifiedBy,
    action: 'client.identity_verified',
    detail: `client ${id}`,
    refTable: 'clients',
    refId: id,
  });
  return getClient(id) as Client;
}
