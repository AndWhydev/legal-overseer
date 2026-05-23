/**
 * Circuit breaker factory for BitBit
 *
 * Wraps external service calls with circuit breaker pattern using opossum.
 * Prevents cascading failures when external services are unavailable.
 */

import CircuitBreaker from 'opossum';
import { createSafeLogger } from './logger.js';
import { sendSystemAlert } from '../email/notifier.js';

const logger = createSafeLogger('CircuitBreaker');

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Name for identification */
  name: string;
  /** Timeout in milliseconds (default 3000) */
  timeout: number;
  /** Percentage of failures to trip the breaker (default 50) */
  errorThresholdPercentage: number;
  /** Time in ms to wait before trying again (default 30000) */
  resetTimeout: number;
  /** Minimum number of requests before calculating error percentage (default 5) */
  volumeThreshold: number;
}

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
};

/**
 * Circuit breaker status
 */
export interface CircuitBreakerStatus {
  name: string;
  state: 'closed' | 'open' | 'halfOpen';
  stats: {
    successes: number;
    failures: number;
    timeouts: number;
    rejects: number;
    latencyMean: number;
  };
}

/**
 * Registry of all circuit breakers
 */
const BREAKERS = new Map<string, CircuitBreaker>();

/**
 * Create a circuit breaker for an async function
 *
 * @param name - Unique name for the circuit breaker
 * @param fn - Async function to wrap
 * @param options - Optional configuration overrides
 * @returns Circuit breaker instance
 */
export function createCircuitBreaker<T>(
  name: string,
  fn: (...args: unknown[]) => Promise<T>,
  options: Partial<Omit<CircuitBreakerConfig, 'name'>> = {}
): CircuitBreaker {
  // Check if breaker already exists
  if (BREAKERS.has(name)) {
    return BREAKERS.get(name) as CircuitBreaker;
  }

  // Merge with defaults
  const config = { ...DEFAULT_CONFIG, ...options };

  // Create circuit breaker
  const breaker = new CircuitBreaker(fn, {
    timeout: config.timeout,
    errorThresholdPercentage: config.errorThresholdPercentage,
    resetTimeout: config.resetTimeout,
    volumeThreshold: config.volumeThreshold,
  });

  // Register event handlers
  breaker.on('success', () => {
    logger.debug(`${name}: Success`);
  });

  breaker.on('timeout', () => {
    logger.warn(`${name}: Timeout after ${config.timeout}ms`);
  });

  breaker.on('reject', () => {
    logger.warn(`${name}: Rejected (circuit open)`);
  });

  breaker.on('open', async () => {
    logger.error(`${name}: Circuit OPENED - service unavailable`);

    // Notify operator via email (no-op if SMTP unconfigured)
    await sendSystemAlert({
      severity: 'error',
      title: 'Circuit Breaker Opened',
      message: `Circuit breaker "${name}" has opened due to repeated failures. Service calls will be rejected until recovery.`,
      component: name,
      action: `Will attempt recovery in ${config.resetTimeout / 1000}s`,
    });
  });

  breaker.on('halfOpen', () => {
    logger.info(`${name}: Circuit half-open - testing recovery`);
  });

  breaker.on('close', async () => {
    logger.info(`${name}: Circuit CLOSED - service recovered`);

    // Notify operator of recovery
    await sendSystemAlert({
      severity: 'warning',
      title: 'Circuit Breaker Recovered',
      message: `Circuit breaker "${name}" has recovered. Normal operations resumed.`,
      component: name,
    });
  });

  breaker.on('fallback', (result: unknown) => {
    logger.debug(`${name}: Fallback executed`, { result });
  });

  // Store in registry
  BREAKERS.set(name, breaker);

  logger.info(`Circuit breaker created: ${name}`, {
    timeout: config.timeout,
    errorThreshold: config.errorThresholdPercentage,
    resetTimeout: config.resetTimeout,
  });

  return breaker;
}

/**
 * Get status of a specific circuit breaker
 *
 * @param name - Name of the circuit breaker
 * @returns Status or null if not found
 */
export function getCircuitBreakerStatus(name: string): CircuitBreakerStatus | null {
  const breaker = BREAKERS.get(name);
  if (!breaker) {
    return null;
  }

  const stats = breaker.stats;

  // Determine state
  let state: 'closed' | 'open' | 'halfOpen' = 'closed';
  if (breaker.opened) {
    state = 'open';
  } else if (breaker.halfOpen) {
    state = 'halfOpen';
  }

  return {
    name,
    state,
    stats: {
      successes: stats.successes ?? 0,
      failures: stats.failures ?? 0,
      timeouts: stats.timeouts ?? 0,
      rejects: stats.rejects ?? 0,
      latencyMean: stats.latencyMean ?? 0,
    },
  };
}

/**
 * Get status of all circuit breakers
 *
 * @returns Map of all circuit breaker statuses
 */
export function getAllCircuitBreakerStatuses(): Map<string, CircuitBreakerStatus> {
  const statuses = new Map<string, CircuitBreakerStatus>();

  for (const [name] of BREAKERS) {
    const status = getCircuitBreakerStatus(name);
    if (status) {
      statuses.set(name, status);
    }
  }

  return statuses;
}

/**
 * Check if any circuit breaker is open
 *
 * @returns True if any breaker is open
 */
export function hasOpenCircuit(): boolean {
  for (const breaker of BREAKERS.values()) {
    if (breaker.opened) {
      return true;
    }
  }
  return false;
}

/**
 * Get names of all open circuit breakers
 *
 * @returns Array of names of open breakers
 */
export function getOpenCircuits(): string[] {
  const open: string[] = [];
  for (const [name, breaker] of BREAKERS) {
    if (breaker.opened) {
      open.push(name);
    }
  }
  return open;
}
