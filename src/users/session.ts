/**
 * Cookie-based session store.
 *
 * Sessions are random 256-bit IDs stored in the SQLite `sessions`
 * table. The dashboard middleware reads the `lo_session` HTTP-only
 * cookie, looks the row up, checks the expiry, and resolves the user.
 *
 * Sessions last 12 hours by default — long enough for a normal work
 * day, short enough that an unattended browser doesn't stay logged in
 * forever. Sliding renewal is intentionally not implemented; the
 * threat model assumes shared firm machines.
 */

import { randomBytes } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { getUserById, type User, updateLastLogin } from './repo.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_COOKIE = 'lo_session';

export interface SessionRow {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
}

export interface Session {
  id: string;
  user: User;
  expiresAt: string;
}

function newSessionId(): string {
  return randomBytes(32).toString('hex');
}

export function createSession(userId: string, ip?: string, userAgent?: string): Session {
  const db = getDatabase();
  const id = newSessionId();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, expiresAt, ip ?? null, userAgent ?? null);
  updateLastLogin(userId);
  const user = getUserById(userId);
  if (!user) throw new Error(`session for unknown user ${userId}`);
  return { id, user, expiresAt };
}

export function destroySession(id: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function destroyAllUserSessions(userId: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function loadSession(id: string): Session | null {
  if (!id) return null;
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
    | SessionRow
    | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    destroySession(id);
    return null;
  }
  const user = getUserById(row.user_id);
  if (!user || user.status !== 'active') {
    destroySession(id);
    return null;
  }
  return { id: row.id, user, expiresAt: row.expires_at };
}

export function purgeExpiredSessions(): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}

export function parseSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setSessionCookieHeader(sessionId: string, secure: boolean): string {
  const flags = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`;
}

export { SESSION_COOKIE };
