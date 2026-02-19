/**
 * Governance module index
 *
 * Single import point for all governance components:
 * - PII redaction
 * - Safe logging
 * - Rate limiting
 * - Anomaly detection
 * - Control plane (kill switches)
 * - Circuit breakers
 *
 * Usage:
 * import { canExecute, logSafe, checkRateLimit } from './governance/index.js';
 */

// PII Redaction
export {
  redact,
  redactObject,
  redactStackTrace,
  isNearKeyword,
} from './pii-redactor.js';

// Safe Logging
export {
  logSafe,
  logAuditSafe,
  logError,
  createSafeLogger,
  type LogLevel,
  type ScopedLogger,
} from './logger.js';

// Rate Limiting
export {
  checkRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  getRateLimitConfig,
  type RiskLevel,
  type RateLimitResult,
} from './rate-limiter.js';

// Anomaly Detection
export {
  detectRateAnomaly,
  detectSequenceAnomaly,
  detectAmountAnomaly,
  recordAnomaly,
  type AnomalyResult,
  type AnomalySeverity,
  type Action as AnomalyAction,
} from './anomaly-detector.js';

// Control Plane
export {
  canExecute,
  emergencyStop,
  enableAgent,
  getControlPlaneStatus,
  isGlobalKillActive,
  recordActionResult,
  type Action,
  type ControlPlaneStatus,
} from './control-plane.js';

// Circuit Breakers
export {
  createCircuitBreaker,
  getCircuitBreakerStatus,
  getAllCircuitBreakerStatuses,
  hasOpenCircuit,
  getOpenCircuits,
  type CircuitBreakerConfig,
  type CircuitBreakerStatus,
} from './circuit-breaker.js';
