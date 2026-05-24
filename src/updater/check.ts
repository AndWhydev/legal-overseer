/**
 * Update channel poller.
 *
 * On a configurable interval (default 24 hours) the product fetches a
 * small JSON manifest from `UPDATE_MANIFEST_URL` and compares its own
 * version. The result is exposed via getUpdateState() for the
 * dashboard banner and /health endpoint.
 *
 * Default endpoint:
 *   https://updates.legaloverseer.com.au/manifest.json
 *
 * Customers behind a strict firewall can either point this at their
 * own internal mirror or set UPDATE_CHECK_DISABLED=true to skip
 * remote checks entirely.
 */

import { createSafeLogger } from '../governance/index.js';
import { getCurrentVersion, semverCompare } from './version.js';
import type { UpdateManifest, UpdateState } from './types.js';

const logger = createSafeLogger('Updater');

const DEFAULT_MANIFEST_URL = 'https://updates.legaloverseer.com.au/manifest.json';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

let state: UpdateState = {
  current: getCurrentVersion(),
  latest: null,
  updateAvailable: false,
  unsupported: false,
  lastCheckedAt: null,
  lastError: null,
  notice: null,
  notesUrl: null,
};
let timer: NodeJS.Timeout | null = null;

function manifestUrl(): string {
  return process.env.UPDATE_MANIFEST_URL || DEFAULT_MANIFEST_URL;
}

function disabled(): boolean {
  return process.env.UPDATE_CHECK_DISABLED === 'true';
}

async function fetchManifest(url: string): Promise<UpdateManifest> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as unknown;
    if (!isManifest(body)) throw new Error('manifest shape invalid');
    return body;
  } finally {
    clearTimeout(t);
  }
}

function isManifest(x: unknown): x is UpdateManifest {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return typeof r.latest === 'string' && typeof r.published_at === 'string';
}

export async function runUpdateCheck(): Promise<UpdateState> {
  if (disabled()) {
    state = { ...state, lastError: 'update checks disabled (UPDATE_CHECK_DISABLED=true)' };
    return state;
  }
  try {
    const manifest = await fetchManifest(manifestUrl());
    const current = getCurrentVersion();
    const updateAvailable = semverCompare(current, manifest.latest) < 0;
    const unsupported =
      !!manifest.minimum_supported && semverCompare(current, manifest.minimum_supported) < 0;
    state = {
      current,
      latest: manifest.latest,
      updateAvailable,
      unsupported,
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
      notice: manifest.notice ?? null,
      notesUrl: manifest.notes_url ?? null,
    };
    if (updateAvailable) {
      logger.info(`update available: ${current} → ${manifest.latest}`);
    }
    if (unsupported) {
      logger.warn(`current version ${current} below minimum supported ${manifest.minimum_supported}`);
    }
  } catch (err) {
    state = {
      ...state,
      lastError: err instanceof Error ? err.message : String(err),
      lastCheckedAt: new Date().toISOString(),
    };
    logger.warn(`update check failed: ${state.lastError}`);
  }
  return state;
}

export function getUpdateState(): UpdateState {
  return state;
}

export function startUpdateChecks(intervalMs = CHECK_INTERVAL_MS): void {
  if (timer) return;
  // First check after a short delay so we never block boot.
  setTimeout(() => { runUpdateCheck().catch(() => undefined); }, 15_000);
  timer = setInterval(() => { runUpdateCheck().catch(() => undefined); }, intervalMs);
  if (timer.unref) timer.unref();
}

export function stopUpdateChecks(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
