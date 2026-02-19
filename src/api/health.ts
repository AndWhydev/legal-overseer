/**
 * Health check handler for BitBit
 *
 * Returns system health status for Fly.io health checks
 * and monitoring endpoints.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDatabase } from '../db/index.js';
import { isClickUpConfigured, getClickUpTeamIdPartial } from '../integrations/clickup/index.js';
import {
  getControlPlaneStatus,
  getAllCircuitBreakerStatuses,
  isGlobalKillActive,
} from '../governance/index.js';

const VERSION = '0.1.0';
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

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  uptime: number;
  uptimeHuman: string;
  database: 'connected' | 'error';
  clickup: {
    configured: boolean;
    teamId: string | null;
  };
  governance: GovernanceStatus;
}

/**
 * Format uptime in human-readable form
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Check database connection status
 */
function checkDatabase(): 'connected' | 'error' {
  try {
    const db = getDatabase();
    const result = db.prepare('SELECT 1 as check_val').get() as {
      check_val: number;
    };
    return result?.check_val === 1 ? 'connected' : 'error';
  } catch {
    return 'error';
  }
}

/**
 * Get governance status for health response
 */
function getGovernanceStatus(): GovernanceStatus {
  const controlPlane = getControlPlaneStatus();
  const circuitBreakerMap = getAllCircuitBreakerStatuses();

  // Convert Map to array for JSON serialization
  const circuitBreakers: GovernanceStatus['circuitBreakers'] = [];
  for (const [name, status] of circuitBreakerMap) {
    circuitBreakers.push({
      name,
      state: status.state,
      failures: status.stats.failures,
    });
  }

  return {
    killSwitchActive: controlPlane.globalKillSwitch,
    disabledAgents: controlPlane.disabledAgents,
    circuitBreakers,
  };
}

/**
 * Health check endpoint handler
 */
export function healthCheck(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  const uptime = Date.now() - startTime;
  const databaseStatus = checkDatabase();
  const governanceStatus = getGovernanceStatus();

  // Determine overall status
  let status: 'ok' | 'degraded' | 'unhealthy' = 'ok';
  let statusCode = 200;

  if (databaseStatus !== 'connected') {
    status = 'unhealthy';
    statusCode = 503;
  } else if (isGlobalKillActive()) {
    // Kill switch active - service unavailable
    status = 'unhealthy';
    statusCode = 503;
  } else if (governanceStatus.circuitBreakers.some((cb: { state: string }) => cb.state === 'open')) {
    // Some circuits open - degraded but functional
    status = 'degraded';
    statusCode = 200;
  }

  const response: HealthResponse = {
    status,
    version: VERSION,
    timestamp: new Date().toISOString(),
    uptime,
    uptimeHuman: formatUptime(uptime),
    database: databaseStatus,
    clickup: {
      configured: isClickUpConfigured(),
      teamId: getClickUpTeamIdPartial(),
    },
    governance: governanceStatus,
  };

  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response, null, 2));
}
