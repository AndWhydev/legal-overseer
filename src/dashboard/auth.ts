/**
 * Auth helpers for the dashboard server.
 *
 * The dashboard middleware in server.ts asks resolveSession() on
 * every request. /login renders a form; POST /login creates a session;
 * /logout destroys it.
 *
 * Failed-login throttling lives here too — a single source-IP that
 * fails repeatedly is locked out for a few minutes to slow online
 * guessing. Not a substitute for proper rate limiting at the edge.
 */

import type { IncomingMessage } from 'node:http';
import { escapeHtml } from './render.js';
import {
  loadSession,
  parseSessionCookie,
  type Session,
} from '../users/session.js';

const FAILED_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILED = 8;
const failedByIp = new Map<string, { count: number; lockedUntil: number }>();

export function resolveSession(req: IncomingMessage): Session | null {
  const sid = parseSessionCookie(req.headers.cookie);
  if (!sid) return null;
  return loadSession(sid);
}

export function requireSession(req: IncomingMessage): Session {
  const s = resolveSession(req);
  if (!s) throw new UnauthorizedError();
  return s;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

export function isLockedOut(ip: string): boolean {
  const rec = failedByIp.get(ip);
  if (!rec) return false;
  if (rec.lockedUntil > Date.now()) return true;
  if (Date.now() - rec.lockedUntil > FAILED_WINDOW_MS) {
    failedByIp.delete(ip);
    return false;
  }
  return false;
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const rec = failedByIp.get(ip) ?? { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_FAILED) {
    rec.lockedUntil = now + FAILED_WINDOW_MS;
    rec.count = 0;
  }
  failedByIp.set(ip, rec);
}

export function recordLoginSuccess(ip: string): void {
  failedByIp.delete(ip);
}

const LOGIN_STYLE = `
:root{--bg:#0f1115;--panel:#181b22;--panel-2:#1f232b;--text:#e6e9ee;--muted:#8a93a4;--accent:#7aa2f7;--red:#f07178}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh}
.card{background:var(--panel);padding:32px;border-radius:8px;max-width:380px;width:100%}
h1{margin:0 0 8px;font-size:18px}
p.lead{color:var(--muted);margin:0 0 20px}
label{display:block;margin:12px 0 4px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
input{width:100%;box-sizing:border-box;background:var(--panel-2);color:var(--text);border:1px solid #2a2f3a;border-radius:4px;padding:8px 10px;font:inherit}
button{margin-top:20px;width:100%;background:var(--accent);color:#0f1115;border:none;border-radius:4px;padding:10px;font:inherit;font-weight:600;cursor:pointer}
.flash{padding:10px 14px;border-radius:6px;margin-bottom:12px;background:#4a2027;color:#ffb8bf;border-left:4px solid var(--red);font-size:13px}
.muted{color:var(--muted);font-size:12px;margin-top:16px;text-align:center}
`;

export function renderLoginPage(flash?: string, email?: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Sign in — Legal Overseer</title><style>${LOGIN_STYLE}</style></head>
<body><form class="card" method="post" action="/login">
  <h1>Legal Overseer</h1>
  <p class="lead">Sign in with your firm email.</p>
  ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}
  <label>Email</label>
  <input name="email" type="email" required autocomplete="username" value="${escapeHtml(email ?? '')}">
  <label>Password</label>
  <input name="password" type="password" required autocomplete="current-password">
  <button type="submit">Sign in</button>
  <p class="muted">Sessions last 12 hours. Forgot your password? Ask an admin to reset it.</p>
</form></body></html>`;
}
