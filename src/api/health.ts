/**
 * Health check handler for Legal Overseer.
 *
 * Returns system health status for load balancers, on-prem monitoring,
 * and the dashboard /health probe. Also reports legal_audit_log
 * chain integrity — a hashes-don't-match result flips status to
 * 'unhealthy' so the operator gets paged.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDatabase } from '../db/index.js';
import {
  getControlPlaneStatus,
  getAllCircuitBreakerStatuses,
  isGlobalKillActive,
} from '../governance/index.js';
import { verifyAuditChain } from '../compliance/audit.js';
import { getLicenceState } from '../licence/index.js';
import { getUpdateState, getCurrentVersion } from '../updater/index.js';
import { isSetupComplete } from '../onboarding/index.js';

const startTime = Date.now();

export interface GovernanceStatus {
  killSwitchActive: boolean;
  disabledAgents: string[];
  circuitBreakers: Array<{
    name: string;
    state: 'closed' | 'open' | 'halfOpen';
    failures: number;
  }>;
}

export interface AuditStatus {
  chainOk: boolean;
  firstBreak: string | null;
}

export interface LicenceHealth {
  valid: boolean;
  readOnly: boolean;
  tier: string | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
}

export interface UpdateHealth {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  unsupported: boolean;
  lastCheckedAt: string | null;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  uptime: number;
  uptimeHuman: string;
  database: 'connected' | 'error';
  audit: AuditStatus;
  governance: GovernanceStatus;
  licence: LicenceHealth;
  update: UpdateHealth;
  setupComplete: boolean;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function checkDatabase(): 'connected' | 'error' {
  try {
    const db = getDatabase();
    const result = db.prepare('SELECT 1 as check_val').get() as { check_val: number };
    return result?.check_val === 1 ? 'connected' : 'error';
  } catch {
    return 'error';
  }
}

function getGovernanceStatus(): GovernanceStatus {
  const controlPlane = getControlPlaneStatus();
  const circuitBreakerMap = getAllCircuitBreakerStatuses();
  const circuitBreakers: GovernanceStatus['circuitBreakers'] = [];
  for (const [name, status] of circuitBreakerMap) {
    circuitBreakers.push({ name, state: status.state, failures: status.stats.failures });
  }
  return {
    killSwitchActive: controlPlane.globalKillSwitch,
    disabledAgents: controlPlane.disabledAgents,
    circuitBreakers,
  };
}

export function healthCheck(_req: IncomingMessage, res: ServerResponse): void {
  const uptime = Date.now() - startTime;
  const databaseStatus = checkDatabase();
  const governanceStatus = getGovernanceStatus();
  const chain = verifyAuditChain();
  const audit: AuditStatus = { chainOk: chain.ok, firstBreak: chain.ok ? null : chain.firstBreak };
  const licenceState = getLicenceState();
  const update = getUpdateState();

  const licence: LicenceHealth = {
    valid: licenceState.valid,
    readOnly: licenceState.readOnly,
    tier: licenceState.payload?.tier ?? null,
    expiresAt: licenceState.payload?.expires_at ?? null,
    daysUntilExpiry: licenceState.daysUntilExpiry,
  };
  const updateHealth: UpdateHealth = {
    current: update.current,
    latest: update.latest,
    updateAvailable: update.updateAvailable,
    unsupported: update.unsupported,
    lastCheckedAt: update.lastCheckedAt,
  };

  let status: HealthResponse['status'] = 'ok';
  let statusCode = 200;

  if (databaseStatus !== 'connected') {
    status = 'unhealthy';
    statusCode = 503;
  } else if (!audit.chainOk) {
    status = 'unhealthy';
    statusCode = 503;
  } else if (isGlobalKillActive()) {
    status = 'unhealthy';
    statusCode = 503;
  } else if (governanceStatus.circuitBreakers.some((cb) => cb.state === 'open')) {
    status = 'degraded';
    statusCode = 200;
  } else if (!licence.valid) {
    status = 'degraded';
    statusCode = 200;
  } else if (updateHealth.unsupported) {
    status = 'degraded';
    statusCode = 200;
  }

  const response: HealthResponse = {
    status,
    version: getCurrentVersion(),
    timestamp: new Date().toISOString(),
    uptime,
    uptimeHuman: formatUptime(uptime),
    database: databaseStatus,
    audit,
    governance: governanceStatus,
    licence,
    update: updateHealth,
    setupComplete: isSetupComplete(),
  };

  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response, null, 2));
}
