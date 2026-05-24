/**
 * Client portal repositories — accounts, sessions, matter access,
 * document visibility, and time-limited share links.
 *
 * Client-side users are intentionally kept in their own table
 * (`client_users`) separate from the firm's lawyer/paralegal users.
 * Different lifecycle, different password policy, and no overlap
 * between the two ACL surfaces.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { hashPassword, verifyPassword } from '../users/password.js';

export type ClientUserStatus = 'active' | 'suspended' | 'removed';

export interface ClientUser {
  id: string;
  email: string;
  full_name: string;
  status: ClientUserStatus;
  password_hash: string;
  password_salt: string;
  password_iter: number;
  last_login_at: string | null;
  created_at: string;
}

export interface CreateClientUserInput {
  email: string;
  full_name: string;
  password: string;
}

export function createClientUser(input: CreateClientUserInput): ClientUser {
  const db = getDatabase();
  const id = randomUUID();
  const email = input.email.trim().toLowerCase();
  const hashed = hashPassword(input.password);
  db.prepare(
    `INSERT INTO client_users
       (id, email, full_name, status, password_hash, password_salt, password_iter)
     VALUES (?, ?, ?, 'active', ?, ?, ?)`,
  ).run(id, email, input.full_name, hashed.hash, hashed.salt, hashed.iter);
  return getClientUserById(id) as ClientUser;
}

export function getClientUserById(id: string): ClientUser | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM client_users WHERE id = ?').get(id) as ClientUser | undefined) ?? null;
}

export function getClientUserByEmail(email: string): ClientUser | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM client_users WHERE email = ?')
    .get(email.trim().toLowerCase()) as ClientUser | undefined) ?? null;
}

export function listClientUsers(): ClientUser[] {
  const db = getDatabase();
  return db.prepare(
    `SELECT * FROM client_users WHERE status <> 'removed' ORDER BY email`,
  ).all() as ClientUser[];
}

export function grantClientMatter(clientUserId: string, matterId: string, grantedBy: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR IGNORE INTO client_user_matters (client_user_id, matter_id, granted_by)
     VALUES (?, ?, ?)`,
  ).run(clientUserId, matterId, grantedBy);
}

export function revokeClientMatter(clientUserId: string, matterId: string): void {
  const db = getDatabase();
  db.prepare(
    `DELETE FROM client_user_matters WHERE client_user_id = ? AND matter_id = ?`,
  ).run(clientUserId, matterId);
}

export function listClientMatters(clientUserId: string): string[] {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT matter_id FROM client_user_matters WHERE client_user_id = ?`,
  ).all(clientUserId) as Array<{ matter_id: string }>;
  return rows.map((r) => r.matter_id);
}

export function isClientAllowedMatter(clientUserId: string, matterId: string): boolean {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT 1 FROM client_user_matters WHERE client_user_id = ? AND matter_id = ?`,
  ).get(clientUserId, matterId) as { 1: number } | undefined;
  return !!row;
}

// ─── document visibility ────────────────────────────────────────────

export function grantDocumentVisibility(input: { documentId: string; matterId: string; grantedBy: string; note?: string }): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR REPLACE INTO client_visible_documents
       (document_id, matter_id, granted_by, granted_at, note)
     VALUES (?, ?, ?, datetime('now'), ?)`,
  ).run(input.documentId, input.matterId, input.grantedBy, input.note ?? null);
}

export function revokeDocumentVisibility(documentId: string): void {
  const db = getDatabase();
  db.prepare(`DELETE FROM client_visible_documents WHERE document_id = ?`).run(documentId);
}

export function isDocumentVisibleToClients(documentId: string): boolean {
  const db = getDatabase();
  return !!db.prepare(`SELECT 1 FROM client_visible_documents WHERE document_id = ?`).get(documentId);
}

export function listVisibleDocumentIds(matterId: string): string[] {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT document_id FROM client_visible_documents WHERE matter_id = ?`,
  ).all(matterId) as Array<{ document_id: string }>;
  return rows.map((r) => r.document_id);
}

// ─── share links (7-day) ────────────────────────────────────────────

export interface ShareLink {
  token: string;
  document_id: string;
  matter_id: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreateShareLinkInput {
  documentId: string;
  matterId: string;
  createdBy: string;
  ttlMs?: number;
}

export function createShareLink(input: CreateShareLinkInput): ShareLink {
  const db = getDatabase();
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + (input.ttlMs ?? SHARE_TTL_MS));
  db.prepare(
    `INSERT INTO share_links (token, document_id, matter_id, created_by, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(token, input.documentId, input.matterId, input.createdBy, expires.toISOString());
  return getShareLink(token) as ShareLink;
}

export function getShareLink(token: string): ShareLink | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM share_links WHERE token = ?').get(token) as ShareLink | undefined) ?? null;
}

export function isShareLinkLive(token: string): ShareLink | null {
  const row = getShareLink(token);
  if (!row) return null;
  if (row.revoked_at) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;
  return row;
}

export function revokeShareLink(token: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE share_links SET revoked_at = datetime('now') WHERE token = ?`).run(token);
}

export function listMatterShareLinks(matterId: string): ShareLink[] {
  const db = getDatabase();
  return db.prepare(
    `SELECT * FROM share_links WHERE matter_id = ? ORDER BY created_at DESC`,
  ).all(matterId) as ShareLink[];
}

// ─── sessions for client portal (separate from firm users) ─────────

export interface ClientSession {
  id: string;
  client_user_id: string;
  created_at: string;
  expires_at: string;
}

const CLIENT_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const CLIENT_SESSION_COOKIE = 'lo_client_session';

export function createClientSession(clientUserId: string): ClientSession {
  const db = getDatabase();
  const id = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + CLIENT_SESSION_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO client_sessions (id, client_user_id, expires_at) VALUES (?, ?, ?)`,
  ).run(id, clientUserId, expires);
  db.prepare(`UPDATE client_users SET last_login_at = datetime('now') WHERE id = ?`).run(clientUserId);
  return { id, client_user_id: clientUserId, created_at: new Date().toISOString(), expires_at: expires };
}

export function loadClientSession(id: string): { session: ClientSession; user: ClientUser } | null {
  if (!id) return null;
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM client_sessions WHERE id = ?').get(id) as ClientSession | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    db.prepare('DELETE FROM client_sessions WHERE id = ?').run(id);
    return null;
  }
  const user = getClientUserById(row.client_user_id);
  if (!user || user.status !== 'active') {
    db.prepare('DELETE FROM client_sessions WHERE id = ?').run(id);
    return null;
  }
  return { session: row, user };
}

export function destroyClientSession(id: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM client_sessions WHERE id = ?').run(id);
}

export function parseClientSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === CLIENT_SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setClientSessionCookie(id: string, secure: boolean): string {
  const flags = [
    `${CLIENT_SESSION_COOKIE}=${encodeURIComponent(id)}`,
    'HttpOnly', 'Path=/client-portal', 'SameSite=Strict',
    `Max-Age=${Math.floor(CLIENT_SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function clearClientSessionCookie(): string {
  return `${CLIENT_SESSION_COOKIE}=; HttpOnly; Path=/client-portal; SameSite=Strict; Max-Age=0`;
}

export function verifyClientPassword(user: ClientUser, password: string): boolean {
  return verifyPassword(password, { hash: user.password_hash, salt: user.password_salt, iter: user.password_iter });
}

export { CLIENT_SESSION_COOKIE };
