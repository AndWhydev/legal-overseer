/**
 * 9.5 — Custom branding.
 *
 * Admin configures firm logo, name, and accent colours. Applied
 * site-wide: dashboard header, login page, client portal, PDF
 * exports, email templates.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { appendLegalAudit } from '../compliance/audit.js';

const DEFAULT_BRANDING_ID = 'firm-default';

export interface BrandingConfig {
  id: string;
  firm_name: string;
  logo_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
  login_tagline: string | null;
  updated_by: string | null;
  updated_at: string;
}

function brandingRoot(): string {
  return process.env.BRANDING_ROOT
    ?? (process.env.NODE_ENV === 'production' ? '/data/branding' : './data/branding');
}

export function getBranding(): BrandingConfig {
  const db = getDatabase();
  const row = db.prepare(`SELECT * FROM branding_config WHERE id = ?`).get(DEFAULT_BRANDING_ID) as BrandingConfig | undefined;
  if (row) return row;
  const seed: BrandingConfig = {
    id: DEFAULT_BRANDING_ID,
    firm_name: 'Legal Overseer',
    logo_path: null,
    primary_color: '#7aa2f7',
    accent_color: '#6dd29b',
    login_tagline: 'AI legal operations for Australian law firms',
    updated_by: null,
    updated_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO branding_config (id, firm_name, logo_path, primary_color, accent_color, login_tagline, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(seed.id, seed.firm_name, seed.logo_path, seed.primary_color, seed.accent_color, seed.login_tagline, seed.updated_at);
  return seed;
}

export interface UpdateBrandingInput {
  firmName?: string;
  primaryColor?: string;
  accentColor?: string;
  loginTagline?: string;
  logoBytes?: Buffer;
  logoFilename?: string;
  updatedBy: string;
}

export function updateBranding(input: UpdateBrandingInput): BrandingConfig {
  const cur = getBranding();
  const db = getDatabase();
  const now = new Date().toISOString();
  let logoPath = cur.logo_path;
  if (input.logoBytes && input.logoFilename) {
    const dir = brandingRoot();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const ext = extname(input.logoFilename) || '.png';
    logoPath = join(dir, `logo-${randomUUID()}${ext}`);
    writeFileSync(logoPath, input.logoBytes, { mode: 0o600 });
  }
  db.prepare(
    `UPDATE branding_config SET
       firm_name = COALESCE(?, firm_name),
       primary_color = COALESCE(?, primary_color),
       accent_color = COALESCE(?, accent_color),
       login_tagline = COALESCE(?, login_tagline),
       logo_path = ?,
       updated_by = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.firmName ?? null,
    input.primaryColor ?? null,
    input.accentColor ?? null,
    input.loginTagline ?? null,
    logoPath,
    input.updatedBy,
    now,
    DEFAULT_BRANDING_ID,
  );
  appendLegalAudit({
    matterId: null,
    actorId: input.updatedBy,
    action: 'branding.update',
    detail: input.firmName ?? '(no name change)',
    refTable: 'branding_config',
    refId: DEFAULT_BRANDING_ID,
  });
  return getBranding();
}

/**
 * Render an inline <style> block with the branded colours, for use in
 * dashboard templates that want to use the firm's accent colour.
 */
export function brandingStyle(): string {
  const b = getBranding();
  return `<style>:root{--brand-primary:${b.primary_color ?? '#7aa2f7'};--brand-accent:${b.accent_color ?? '#6dd29b'};}</style>`;
}
