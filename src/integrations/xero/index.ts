/**
 * 7.1 — Xero integration.
 *
 * Bidirectional sync with Xero for invoices, payments, and trust
 * account transactions. OAuth-based; configured via integration_configs
 * row with provider='xero'.
 *
 * When credentials aren't present the module short-circuits — caller
 * sees `configured: false` and falls back to local-only operation.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../../db/connection.js';
import { createSafeLogger } from '../../governance/index.js';
import { appendLegalAudit } from '../../compliance/audit.js';

const logger = createSafeLogger('XeroIntegration');

const XERO_BASE = 'https://api.xero.com/api.xro/2.0';

export interface XeroConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  tenantId: string;
  trustAccountId?: string;
}

export interface XeroSyncResult {
  ok: boolean;
  configured: boolean;
  invoicesPushed: number;
  invoicesPulled: number;
  paymentsPulled: number;
  errors: string[];
}

function getConfig(): XeroConfig | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT config_json FROM integration_configs WHERE provider = 'xero' AND enabled = 1`)
    .get() as { config_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.config_json) as XeroConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: XeroConfig, acting: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO integration_configs (id, provider, config_json, enabled, updated_at)
     VALUES (COALESCE((SELECT id FROM integration_configs WHERE provider = 'xero'), ?), 'xero', ?, 1, ?)`,
  ).run(randomUUID(), JSON.stringify(config), now);
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'xero.configure',
    detail: `tenant ${config.tenantId}`,
    refTable: 'integration_configs',
    refId: null,
  });
}

export function isConfigured(): boolean {
  return getConfig() !== null;
}

async function refreshAccessToken(config: XeroConfig): Promise<XeroConfig> {
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(config.refreshToken)}`,
  });
  if (!res.ok) throw new Error(`Xero token refresh failed: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return {
    ...config,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

async function ensureFreshToken(config: XeroConfig): Promise<XeroConfig> {
  if (new Date(config.tokenExpiresAt).getTime() > Date.now() + 60000) return config;
  const fresh = await refreshAccessToken(config);
  saveConfig(fresh, 'xero-system');
  return fresh;
}

interface XeroInvoiceLineItem {
  Description: string;
  Quantity: number;
  UnitAmount: number;
  AccountCode?: string;
}

interface XeroInvoicePayload {
  Type: 'ACCREC';
  Contact: { Name: string };
  InvoiceNumber: string;
  Date: string;
  DueDate: string;
  LineItems: XeroInvoiceLineItem[];
  Status: 'AUTHORISED' | 'DRAFT';
}

export interface PushInvoiceInput {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  lineItems: { description: string; quantity: number; unitPriceAud: number }[];
}

export async function pushInvoiceToXero(input: PushInvoiceInput): Promise<{ ok: boolean; xeroId?: string; error?: string }> {
  let config = getConfig();
  if (!config) return { ok: false, error: 'xero not configured' };
  try {
    config = await ensureFreshToken(config);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const payload: XeroInvoicePayload = {
    Type: 'ACCREC',
    Contact: { Name: input.clientName },
    InvoiceNumber: input.invoiceNumber,
    Date: input.issueDate,
    DueDate: input.dueDate,
    LineItems: input.lineItems.map((l) => ({
      Description: l.description,
      Quantity: l.quantity,
      UnitAmount: l.unitPriceAud,
      AccountCode: '200',
    })),
    Status: 'AUTHORISED',
  };
  try {
    const res = await fetch(`${XERO_BASE}/Invoices`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        'xero-tenant-id': config.tenantId,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ Invoices: [payload] }),
    });
    if (!res.ok) {
      const text = await res.text();
      logSyncFailure('invoice', input.invoiceId, `HTTP ${res.status}: ${text.slice(0, 240)}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { Invoices?: { InvoiceID: string }[] };
    const xeroId = data.Invoices?.[0]?.InvoiceID;
    logSyncSuccess('invoice', input.invoiceId, xeroId);
    return { ok: true, xeroId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSyncFailure('invoice', input.invoiceId, msg);
    return { ok: false, error: msg };
  }
}

function logSyncSuccess(kind: 'invoice' | 'payment' | 'trust_transaction', localId: string, xeroId?: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO xero_sync_log (id, kind, local_id, xero_id, direction, status)
     VALUES (?, ?, ?, ?, 'to_xero', 'synced')`,
  ).run(randomUUID(), kind, localId, xeroId ?? null);
}

function logSyncFailure(kind: 'invoice' | 'payment' | 'trust_transaction', localId: string, error: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO xero_sync_log (id, kind, local_id, xero_id, direction, status, error_message)
     VALUES (?, ?, ?, NULL, 'to_xero', 'failed', ?)`,
  ).run(randomUUID(), kind, localId, error);
}

export async function pullPayments(): Promise<{ ok: boolean; count: number; error?: string }> {
  let config = getConfig();
  if (!config) return { ok: false, count: 0, error: 'not configured' };
  try {
    config = await ensureFreshToken(config);
  } catch (err) {
    return { ok: false, count: 0, error: err instanceof Error ? err.message : String(err) };
  }
  const sinceMs = Date.now() - 30 * 86400000;
  const since = new Date(sinceMs).toISOString();
  try {
    const res = await fetch(`${XERO_BASE}/Payments?where=Date>=DateTime(${since.slice(0, 10).replace(/-/g, ',')})`, {
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        'xero-tenant-id': config.tenantId,
        accept: 'application/json',
      },
    });
    if (!res.ok) return { ok: false, count: 0, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { Payments?: { PaymentID: string; Amount: number; Date: string; Invoice?: { InvoiceNumber: string } }[] };
    const payments = data.Payments ?? [];
    const db = getDatabase();
    let count = 0;
    for (const p of payments) {
      if (!p.Invoice?.InvoiceNumber) continue;
      const invoice = db
        .prepare('SELECT id FROM invoices WHERE invoice_number = ?')
        .get(p.Invoice.InvoiceNumber) as { id: string } | undefined;
      if (!invoice) continue;
      const exists = db
        .prepare(
          `SELECT 1 FROM xero_sync_log WHERE kind = 'payment' AND xero_id = ? AND status = 'synced'`,
        )
        .get(p.PaymentID);
      if (exists) continue;
      db.prepare(
        `INSERT INTO invoice_payments (id, invoice_id, amount_aud, payment_date, method, reference, recorded_by)
         VALUES (?, ?, ?, ?, 'xero', ?, 'xero-sync')`,
      ).run(randomUUID(), invoice.id, p.Amount, p.Date.slice(0, 10), p.PaymentID);
      db.prepare(
        `INSERT INTO xero_sync_log (id, kind, local_id, xero_id, direction, status)
         VALUES (?, 'payment', ?, ?, 'from_xero', 'synced')`,
      ).run(randomUUID(), invoice.id, p.PaymentID);
      count += 1;
    }
    logger.info(`pulled ${count} payments from xero`);
    return { ok: true, count };
  } catch (err) {
    return { ok: false, count: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function generateMonthlyReconciliation(period: string): Promise<{ matches: number; mismatches: number }> {
  // Placeholder for the diff between Xero and Legal Overseer for the period.
  // Calls pullPayments() and lists discrepancies in xero_sync_log.
  await pullPayments();
  const db = getDatabase();
  const failures = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM xero_sync_log
       WHERE status = 'failed' AND substr(synced_at, 1, 7) = ?`,
    )
    .get(period) as { n: number }).n;
  const successes = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM xero_sync_log
       WHERE status = 'synced' AND substr(synced_at, 1, 7) = ?`,
    )
    .get(period) as { n: number }).n;
  return { matches: successes, mismatches: failures };
}
