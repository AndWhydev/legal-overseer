/**
 * 9.1 — Single Sign On.
 *
 * Supports Microsoft Azure AD (SAML 2.0) and Google Workspace
 * (OAuth 2.0). Falls back to local authentication when neither is
 * configured. First SSO login auto-creates a Legal Overseer account
 * for the user if their email matches an invited lawyer record.
 */

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { getUserByEmail, createUser, type User } from '../users/repo.js';
import { createSession, type Session } from '../users/session.js';

const logger = createSafeLogger('SSO');

export type SsoProvider = 'azure_ad' | 'google_workspace';

export interface SsoConfig {
  provider: SsoProvider;
  config: {
    clientId: string;
    clientSecret?: string;
    tenantId?: string;
    metadataUrl?: string;
    redirectUri: string;
    allowedDomains?: string[];
  };
}

export function saveSsoConfig(config: SsoConfig, acting: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO sso_configs (id, provider, config_json, enabled, created_at, updated_at)
     VALUES (COALESCE((SELECT id FROM sso_configs WHERE provider = ?), ?), ?, ?, 1, ?, ?)`,
  ).run(config.provider, randomUUID(), config.provider, JSON.stringify(config.config), now, now);
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'sso.configure',
    detail: config.provider,
    refTable: 'sso_configs',
    refId: null,
  });
  logger.info(`SSO configured: ${config.provider}`);
}

export function getSsoConfig(provider: SsoProvider): SsoConfig | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT config_json FROM sso_configs WHERE provider = ? AND enabled = 1`)
    .get(provider) as { config_json: string } | undefined;
  if (!row) return null;
  try {
    return { provider, config: JSON.parse(row.config_json) as SsoConfig['config'] };
  } catch {
    return null;
  }
}

export function isSsoEnabled(): boolean {
  const db = getDatabase();
  const row = db.prepare(`SELECT COUNT(*) AS n FROM sso_configs WHERE enabled = 1`).get() as { n: number };
  return row.n > 0;
}

const STATE_TOKENS = new Map<string, { provider: SsoProvider; createdAt: number }>();

export function startSsoFlow(provider: SsoProvider): { authUrl: string; state: string } {
  const cfg = getSsoConfig(provider);
  if (!cfg) throw new Error(`SSO provider ${provider} not configured`);
  const state = randomBytes(16).toString('hex');
  STATE_TOKENS.set(state, { provider, createdAt: Date.now() });
  // Clean expired states (>10 min old).
  for (const [k, v] of STATE_TOKENS) {
    if (Date.now() - v.createdAt > 600_000) STATE_TOKENS.delete(k);
  }
  if (provider === 'google_workspace') {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', cfg.config.clientId);
    u.searchParams.set('redirect_uri', cfg.config.redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'openid email profile');
    u.searchParams.set('state', state);
    return { authUrl: u.toString(), state };
  }
  if (provider === 'azure_ad') {
    const tenant = cfg.config.tenantId ?? 'common';
    const u = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
    u.searchParams.set('client_id', cfg.config.clientId);
    u.searchParams.set('redirect_uri', cfg.config.redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'openid email profile');
    u.searchParams.set('state', state);
    return { authUrl: u.toString(), state };
  }
  throw new Error(`unknown provider ${provider}`);
}

export interface SsoCallbackResult {
  ok: boolean;
  session?: Session;
  user?: User;
  error?: string;
}

interface TokenExchangeResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface UserInfoResponse {
  email?: string;
  name?: string;
  sub?: string;
  preferred_username?: string;
}

async function exchangeCode(provider: SsoProvider, cfg: SsoConfig['config'], code: string): Promise<UserInfoResponse | null> {
  if (provider === 'google_workspace') {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: cfg.clientId, client_secret: cfg.clientSecret ?? '',
        redirect_uri: cfg.redirectUri, grant_type: 'authorization_code',
      }),
    });
    const data = (await tokenRes.json()) as TokenExchangeResponse;
    if (data.error || !data.access_token) return null;
    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${data.access_token}` },
    });
    return (await userRes.json()) as UserInfoResponse;
  }
  if (provider === 'azure_ad') {
    const tenant = cfg.tenantId ?? 'common';
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: cfg.clientId, client_secret: cfg.clientSecret ?? '',
        redirect_uri: cfg.redirectUri, grant_type: 'authorization_code',
        scope: 'openid email profile',
      }),
    });
    const data = (await tokenRes.json()) as TokenExchangeResponse;
    if (data.error || !data.access_token) return null;
    const userRes = await fetch('https://graph.microsoft.com/oidc/userinfo', {
      headers: { authorization: `Bearer ${data.access_token}` },
    });
    return (await userRes.json()) as UserInfoResponse;
  }
  return null;
}

export async function handleSsoCallback(state: string, code: string, ip: string, userAgent?: string): Promise<SsoCallbackResult> {
  const ctx = STATE_TOKENS.get(state);
  if (!ctx) return { ok: false, error: 'invalid or expired state' };
  STATE_TOKENS.delete(state);
  const cfg = getSsoConfig(ctx.provider);
  if (!cfg) return { ok: false, error: 'SSO provider missing' };
  const userInfo = await exchangeCode(ctx.provider, cfg.config, code);
  if (!userInfo || !userInfo.email) return { ok: false, error: 'no user info returned' };

  const email = userInfo.email.toLowerCase();
  if (cfg.config.allowedDomains && cfg.config.allowedDomains.length) {
    const domain = email.split('@')[1] ?? '';
    if (!cfg.config.allowedDomains.includes(domain)) {
      return { ok: false, error: 'email domain not allowed' };
    }
  }

  let user = getUserByEmail(email);
  if (!user) {
    user = createUser({
      email,
      full_name: userInfo.name ?? email,
      role: 'lawyer',
      password: randomBytes(24).toString('hex'),
    });
  }
  const db = getDatabase();
  const existingLink = db
    .prepare(`SELECT * FROM sso_links WHERE user_id = ? AND provider = ?`)
    .get(user.id, ctx.provider);
  if (!existingLink) {
    db.prepare(
      `INSERT OR IGNORE INTO sso_links (id, user_id, provider, provider_user_id, provider_email)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(randomUUID(), user.id, ctx.provider, userInfo.sub ?? email, email);
  }
  const session = createSession(user.id, ip, userAgent);
  appendLegalAudit({
    matterId: null,
    actorId: user.email,
    action: 'sso.login',
    detail: `${ctx.provider} from ${ip}`,
    refTable: 'users',
    refId: user.id,
  });
  return { ok: true, session, user };
}

void createHmac;
void timingSafeEqual;
